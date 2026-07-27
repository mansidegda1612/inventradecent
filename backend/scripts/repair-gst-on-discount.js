/**
 * repair-gst-on-discount.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off data repair for bills saved BEFORE GST was moved onto the
 * post-discount amount (see frontend/src/utils/TransactionUtils.js — the
 * expense sequence).
 *
 * The old code charged CGST/SGST on the raw item amount, so a bill-level
 * discount never reduced the tax:
 *
 *     items 350, discount 35, GST 18%
 *        was:  GST = 18% of 350 = 63.00   →  350 + 63 − 35   = 378
 *     should:  GST = 18% of 315 = 56.70   →  350 − 35 + 56.70 = 371.70 → 372
 *
 * RE-SAVING A LEGACY BILL DOES NOT FIX IT. Reload back-derives the per-line
 * GST % from the stored amount (there is no cgst_pct column), so a legacy bill
 * opens with an *inflated* percentage — exactly inflated enough to reproduce
 * the old wrong tax. The rows have to be repaired here.
 *
 * Usage (from backend/):
 *     node scripts/repair-gst-on-discount.js                 # dry run (default)
 *     node scripts/repair-gst-on-discount.js --apply         # commit changes
 *     node scripts/repair-gst-on-discount.js --org=3         # limit to one org
 *     node scripts/repair-gst-on-discount.js --include-unknown
 *
 * Safety:
 *   - dry run by default; --apply wraps everything in ONE transaction
 *   - only looks at bills with a non-zero discount (without one, the old and
 *     new arithmetic are identical — nothing to fix)
 *   - CLASSIFIES each bill before touching it, comparing every line's effective
 *     rate against product.gstPer:
 *         matches on the gross amount      → legacy      → repair
 *         matches on the discounted amount → already-net → skip
 *         neither                          → unknown     → skip unless
 *                                                          --include-unknown
 *     ("unknown" means the rate was overridden on the bill, or the product
 *     master's gstPer has changed since the bill was raised.)
 *   - recomputes per line by scaling the rate the bill was ACTUALLY saved with,
 *     so per-line overrides survive
 *   - posts the delta to the party ledger in the same directions the save
 *     routes use (SI → debit/closing +delta; PI → credit +delta / closing
 *     −delta), skipping cash bills (customer_id 0)
 *   - warns if receipts already adjusted against a bill now exceed its reduced
 *     total
 *   - IDEMPOTENT — a repaired bill classifies as `already-net` on the next run
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const pool = require("../config/db");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const INCLUDE_UNKNOWN = args.includes("--include-unknown");
const ORG = (() => {
  const a = args.find((x) => x.startsWith("--org="));
  return a ? parseInt(a.split("=")[1], 10) : null;
})();

// Tolerance when matching a line's effective rate against the product master,
// in percentage points. Generous enough to absorb per-line paisa rounding on a
// small line, tight enough not to confuse 5% with 12%.
const RATE_TOL = 0.15;

const round2 = (n) => parseFloat(((parseFloat(n) || 0)).toFixed(2));
const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

/**
 * Decide what arithmetic a bill was saved with by checking each line's
 * effective tax rate against the product master rate.
 */
function classify(items, factor) {
  let legacy = 0, net = 0, unknown = 0;

  for (const i of items) {
    const taxable = parseFloat(i.taxable_amount) || 0;
    const tax = (parseFloat(i.CGST) || 0) + (parseFloat(i.SGST) || 0);
    const master = parseFloat(i.gstPer);

    // A zero-tax or zero-value line carries no evidence either way.
    if (!taxable || !tax || !Number.isFinite(master) || master === 0) continue;

    const effGross = (tax / taxable) * 100;
    const effNet = factor ? (tax / (taxable * factor)) * 100 : Infinity;

    if (Math.abs(effGross - master) <= RATE_TOL) legacy++;
    else if (Math.abs(effNet - master) <= RATE_TOL) net++;
    else unknown++;
  }

  if (unknown > 0) return "unknown";
  if (legacy > 0 && net === 0) return "legacy";
  if (net > 0 && legacy === 0) return "already-net";
  if (legacy > 0 && net > 0) return "unknown";   // mixed — don't guess
  return "no-tax";                                // nothing taxable to repair
}

async function main() {
  console.log(
    `\nGST-on-discount repair — ${APPLY ? "APPLY (writes committed)" : "DRY RUN (no writes)"}` +
    `${ORG ? `  org_id=${ORG}` : "  all orgs"}\n`
  );

  const params = [];
  let where = "t.trans_type IN ('SI','PI') AND t.discount IS NOT NULL AND t.discount <> 0";
  if (ORG) { where += " AND t.org_id = ?"; params.push(ORG); }

  const [bills] = await pool.query(
    `SELECT t.id, t.org_id, t.trans_type, t.bill_no, t.date, t.customer_id,
            t.isgstbill, t.taxable_amount, t.discount, t.ROUNDOFF, t.final_amount
       FROM \`transaction\` t
      WHERE ${where}
      ORDER BY t.org_id, t.date, t.id`,
    params
  );

  if (!bills.length) {
    console.log("No bills with a non-zero discount found — nothing to repair.");
    console.log("(Without a discount the old and new arithmetic are identical.)\n");
    return;
  }

  console.log(`${bills.length} discounted bill(s) to examine.\n`);

  const conn = APPLY ? await pool.getConnection() : null;
  if (conn) await conn.beginTransaction();
  const q = (sql, p) => (conn ? conn.query(sql, p) : pool.query(sql, p));

  const tally = { legacy: 0, "already-net": 0, unknown: 0, "no-tax": 0, repaired: 0 };
  const warnings = [];

  try {
    for (const b of bills) {
      const [items] = await q(
        `SELECT ti.id, ti.product_id, ti.taxable_amount, ti.CGST, ti.SGST, p.gstPer
           FROM transaction_items ti
           LEFT JOIN product p ON p.id = ti.product_id AND p.org_id = ti.org_id
          WHERE ti.transaction_id = ? AND ti.org_id = ?
          ORDER BY ti.id ASC`,
        [b.id, b.org_id]
      );

      const subtotal = round2(items.reduce((s, i) => s + (parseFloat(i.taxable_amount) || 0), 0));
      const discount = round2(b.discount);
      const factor = subtotal ? (subtotal - discount) / subtotal : 1;

      const label = `[org ${b.org_id}] ${b.trans_type} ${b.bill_no} (id ${b.id})`;

      if (!subtotal) {
        console.log(`  skip        ${label} — zero taxable total`);
        tally.unknown++;
        continue;
      }

      const kind = classify(items, factor);
      tally[kind] = (tally[kind] || 0) + 1;

      if (kind === "already-net") {
        console.log(`  already-net ${label} — tax already on the discounted base`);
        continue;
      }
      if (kind === "no-tax") {
        console.log(`  no-tax      ${label} — no taxable lines to repair`);
        continue;
      }
      if (kind === "unknown" && !INCLUDE_UNKNOWN) {
        console.log(
          `  unknown     ${label} — line rate matches neither base ` +
          `(overridden on the bill, or product gstPer changed). Skipped; ` +
          `re-run with --include-unknown to repair anyway.`
        );
        continue;
      }

      // ── Recompute. Scaling the STORED amount preserves whatever rate the bill
      //    was actually saved with, including per-line overrides.
      let newGST = 0;
      const lineUpdates = [];
      for (const i of items) {
        const newCGST = round2((parseFloat(i.CGST) || 0) * factor);
        const newSGST = round2((parseFloat(i.SGST) || 0) * factor);
        newGST = round2(newGST + newCGST + newSGST);
        lineUpdates.push({ id: i.id, newCGST, newSGST });
      }

      const preRound = round2(subtotal - discount + newGST);
      const newFinal = Math.round(preRound);
      const newRoundoff = round2(newFinal - preRound);
      const oldFinal = round2(b.final_amount);
      const delta = round2(newFinal - oldFinal);

      console.log(
        `  REPAIR      ${label}  GST ${fmt(
          items.reduce((s, i) => s + (parseFloat(i.CGST) || 0) + (parseFloat(i.SGST) || 0), 0)
        )} → ${fmt(newGST)}   final ${fmt(oldFinal)} → ${fmt(newFinal)}   (Δ ${fmt(delta)})`
      );

      // Receipts already adjusted against this bill may now exceed its total.
      const [[adj]] = await q(
        `SELECT IFNULL(SUM(adjusted_amount),0) AS adjusted
           FROM transaction_adjustments
          WHERE bill_transaction_id = ? AND org_id = ?`,
        [b.id, b.org_id]
      );
      const adjusted = round2(adj.adjusted);
      if (adjusted > newFinal + 0.01) {
        const w = `${label} — adjusted receipts ${fmt(adjusted)} now exceed the reduced total ${fmt(newFinal)} (over by ${fmt(adjusted - newFinal)})`;
        warnings.push(w);
        console.log(`              ⚠ ${w}`);
      }

      tally.repaired++;
      if (!APPLY) continue;

      for (const u of lineUpdates) {
        await q(
          `UPDATE transaction_items SET CGST = ?, SGST = ?, updation_date = NOW()
            WHERE id = ? AND org_id = ?`,
          [u.newCGST, u.newSGST, u.id, b.org_id]
        );
      }

      await q(
        `UPDATE \`transaction\`
            SET ROUNDOFF = ?, final_amount = ?, updation_date = NOW()
          WHERE id = ? AND org_id = ?`,
        [newRoundoff, newFinal, b.id, b.org_id]
      );

      // Ledger — same directions the save routes post in. Cash bills
      // (customer_id 0) never hit the ledger, so nothing to correct.
      if (delta !== 0 && b.customer_id && b.customer_id !== 0) {
        if (b.trans_type === "SI") {
          await q(
            "UPDATE customer SET debit = debit + ?, closing = closing + ? WHERE id = ? AND org_id = ?",
            [delta, delta, b.customer_id, b.org_id]
          );
        } else if (b.trans_type === "PI") {
          await q(
            "UPDATE customer SET credit = credit + ?, closing = closing - ? WHERE id = ? AND org_id = ?",
            [delta, delta, b.customer_id, b.org_id]
          );
        }
      }
    }

    if (conn) {
      await conn.commit();
      console.log("\nCommitted.");
    }
  } catch (e) {
    if (conn) { await conn.rollback(); console.error("\nRolled back — nothing was written."); }
    throw e;
  } finally {
    if (conn) conn.release();
  }

  console.log(
    `\nSummary: ${tally.legacy} legacy, ${tally["already-net"]} already-net, ` +
    `${tally.unknown} unknown, ${tally["no-tax"]} no-tax → ${tally.repaired} ` +
    `bill(s) ${APPLY ? "repaired" : "would be repaired"}.`
  );
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s) — over-adjusted bills need a manual look:`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
  if (!APPLY && tally.repaired > 0) {
    console.log("\nDry run only. Back up the database, then re-run with --apply.");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
