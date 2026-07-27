// One-time, re-runnable setup: seeds the `plan` table with the 6 tiers
// (Starter/Growth/Business x yearly/monthly) and creates the matching
// Razorpay Plan objects via their API, storing the resulting
// provider_plan_id back onto each row. Safe to re-run — skips any plan
// code that already has a provider_plan_id.
//
// Usage: node scripts/seed-plans.js
require("dotenv").config();
const pool = require("../config/db");
const { createPlan } = require("../utils/razorpay");

const PLANS = [
  { code: "starter_y",  name: "Starter",           price_inr: 2499, billing_interval: "yearly",  max_orgs: 1, max_users: 1,  features: { whatsapp: false }, razorpay: { period: "yearly",  interval: 1 } },
  { code: "growth_y",   name: "Growth",             price_inr: 4499, billing_interval: "yearly",  max_orgs: 1, max_users: 3,  features: { whatsapp: true  }, razorpay: { period: "yearly",  interval: 1 } },
  { code: "business_y", name: "Business",           price_inr: 7999, billing_interval: "yearly",  max_orgs: 3, max_users: 10, features: { whatsapp: true  }, razorpay: { period: "yearly",  interval: 1 } },
  { code: "starter_m",  name: "Starter (Monthly)",  price_inr: 299,  billing_interval: "monthly", max_orgs: 1, max_users: 1,  features: { whatsapp: false }, razorpay: { period: "monthly", interval: 1 } },
  { code: "growth_m",   name: "Growth (Monthly)",   price_inr: 549,  billing_interval: "monthly", max_orgs: 1, max_users: 3,  features: { whatsapp: true  }, razorpay: { period: "monthly", interval: 1 } },
  { code: "business_m", name: "Business (Monthly)", price_inr: 899,  billing_interval: "monthly", max_orgs: 3, max_users: 10, features: { whatsapp: true  }, razorpay: { period: "monthly", interval: 1 } },
];

async function main() {
  for (const p of PLANS) {
    const [existing] = await pool.query("SELECT id, provider_plan_id FROM plan WHERE code = ?", [p.code]);

    let planRowId;
    if (existing.length) {
      planRowId = existing[0].id;
      if (existing[0].provider_plan_id) {
        console.log(`"${p.code}" already fully seeded (plan.id=${planRowId}, provider_plan_id=${existing[0].provider_plan_id}) — skipping`);
        continue;
      }
      console.log(`"${p.code}" row exists (id=${planRowId}) but has no provider_plan_id yet — creating it now`);
    } else {
      const [r] = await pool.query(
        `INSERT INTO plan (code, name, price_inr, billing_interval, max_orgs, max_users, features, is_active)
         VALUES (?,?,?,?,?,?,?,1)`,
        [p.code, p.name, p.price_inr, p.billing_interval, p.max_orgs, p.max_users, JSON.stringify(p.features)]
      );
      planRowId = r.insertId;
      console.log(`seeded "${p.code}" (plan.id=${planRowId})`);
    }

    try {
      const rzPlan = await createPlan({
        period: p.razorpay.period,
        interval: p.razorpay.interval,
        name: p.name,
        amountPaise: p.price_inr * 100,
        description: `InventraDecent — ${p.name} (${p.billing_interval})`,
      });
      await pool.query("UPDATE plan SET provider_plan_id = ? WHERE id = ?", [rzPlan.id, planRowId]);
      console.log(`  -> Razorpay plan ${rzPlan.id} created and linked`);
    } catch (e) {
      // DB row stays seeded either way — re-run this script once Razorpay
      // credentials/config are fixed and it'll pick up only what's missing.
      console.error(`  -> Razorpay plan creation FAILED for "${p.code}":`, e.response?.data || e.message);
    }
  }
  console.log("\nDone.");
  process.exit(0);
}

main().catch(e => {
  console.error("seed-plans crashed:", e.response?.data || e.message);
  process.exit(1);
});
