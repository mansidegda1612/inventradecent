import { useState, useEffect, useCallback, useMemo } from "react";
import { C } from "../utils/theme";
import { fmt, fmtNum } from "../utils/format";
import { Card, PageHeader, Spinner, Dropdown, EmptyState, TableWrap, Modal, Field, Btn, Tabs } from "../components/ui";
import { callAPI } from "../utils/callserver";
import { downloadGstr1Excel, gstr1FileName } from "../utils/gstr1Excel";

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 'MMYYYY' for the month before today — the one usually being filed. */
function defaultPeriod() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return String(d.getMonth() + 1).padStart(2, "0") + d.getFullYear();
}

/**
 * Indian financial year that a date falls in, labelled by its STARTING year.
 * January to March belong to the year that began the previous April.
 */
function finYearOf(d = new Date()) {
  return d.getMonth() + 1 < 4 ? d.getFullYear() - 1 : d.getFullYear();
}

function periodLabel(p) {
  if (!/^\d{6}$/.test(p || "")) return p;
  return `${MONTHS[Number(p.slice(0, 2)) - 1]} ${p.slice(2)}`;
}

/** Last 24 months, newest first. Filing is always retrospective. */
function periodOptions() {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 1; i <= 24; i++) {
    const c = new Date(d);
    c.setMonth(c.getMonth() - i);
    const id = String(c.getMonth() + 1).padStart(2, "0") + c.getFullYear();
    out.push({ id, name: periodLabel(id) });
  }
  return out;
}

/** The current financial year and the four before it. */
function fyOptions() {
  const now = finYearOf();
  return Array.from({ length: 5 }, (_, i) => {
    const y = now - i;
    return { id: String(y), name: `FY ${y}-${String(y + 1).slice(2)}` };
  });
}

const QUARTERS = [
  { id: "1", name: "Q1 · Apr – Jun" },
  { id: "2", name: "Q2 · Jul – Sep" },
  { id: "3", name: "Q3 · Oct – Dec" },
  { id: "4", name: "Q4 · Jan – Mar" },
];

// Tabs keys off `key`, not `id` — see components/ui Tabs().
const MODES = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

/** The report query string for the current selection. */
function buildQuery({ mode, period, fy, quarter }) {
  if (mode === "quarterly") return `mode=quarterly&fy=${fy}&quarter=${quarter}`;
  if (mode === "yearly") return `mode=yearly&fy=${fy}`;
  return `mode=monthly&period=${period}`;
}

const STATUS_COLOR = { PASS: C.green, WARN: C.amber, FAIL: C.red };
const STATUS_BG = { PASS: C.greenBg, WARN: C.amberBg, FAIL: C.redBg };

const total = (rows, key) => (rows || []).reduce((a, r) => a + (Number(r[key]) || 0), 0);

/** Taxable value excluding nil-rated lines — the figure the tables tie on. */
const taxableOf = (rows) =>
  (rows || []).filter((r) => Number(r.rate) > 0).reduce((a, r) => a + (Number(r.taxable_value) || 0), 0);

const taxOf = (rows) =>
  total(rows, "igst") + total(rows, "cgst") + total(rows, "sgst") + total(rows, "cess");

// ─── sub-components ─────────────────────────────────────────────────────────

function CheckRow({ check }) {
  return (
    <div className="g1-check">
      <span
        className="g1-check-pill"
        style={{ color: STATUS_COLOR[check.status], background: STATUS_BG[check.status] }}
      >
        {check.status}
      </span>
      <span className="g1-check-name">{check.id}</span>
      <span className="g1-check-detail">{check.detail}</span>
    </div>
  );
}

const PAGE = 100;

/**
 * One GSTR-1 section. Always rendered, even when empty — a nil section is a
 * reportable fact, not an absence, and hiding it would let someone file
 * without noticing a table went blank.
 *
 * A yearly B2B table can run to thousands of invoices, so only the first
 * {PAGE} are in the DOM until asked for. The download always carries all of
 * them; this cap is a rendering concern and never a data one.
 */
function Section({ number, title, note, columns, rows = [], renderRow, total: totalRow }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, PAGE);

  return (
    <Card
      title={`Table ${number} — ${title}`}
      action={<span className="g1-rowcount">{rows.length} row{rows.length === 1 ? "" : "s"}</span>}
    >
      {note && <p className="g1-note">{note}</p>}
      {rows.length === 0 ? (
        <p className="g1-empty">Nil for this period.</p>
      ) : (
        <>
          <TableWrap>
            <table className="g1-table">
              <thead>
                <tr>{columns.map((c) => <th key={c.key} className={c.numeric ? "g1-num" : ""}>{c.label}</th>)}</tr>
              </thead>
              <tbody>{shown.map(renderRow)}</tbody>
              {totalRow && (
                <tfoot>
                  <tr className="g1-total-row">{totalRow}</tr>
                </tfoot>
              )}
            </table>
          </TableWrap>
          {rows.length > PAGE && (
            <button className="g1-more" onClick={() => setExpanded((v) => !v)}>
              {expanded
                ? `Show the first ${PAGE} only`
                : `Showing ${PAGE} of ${rows.length} — show all`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function GSTR1Report() {
  const [mode, setMode] = useState("monthly");
  const [period, setPeriod] = useState(defaultPeriod());
  const [fy, setFy] = useState(String(finYearOf()));
  const [quarter, setQuarter] = useState("1");

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [checks, setChecks] = useState([]);
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [forced, setForced] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [arn, setArn] = useState("");
  const [notes, setNotes] = useState("");
  const [filing, setFiling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4500); };

  const query = useMemo(
    () => buildQuery({ mode, period, fy, quarter }),
    [mode, period, fy, quarter]
  );

  const load = useCallback(async (q, force = false) => {
    setLoading(true);
    setError(null);
    setBlocked(false);
    setReport(null);
    setForced(force);
    try {
      const res = await callAPI(`gstr1/report?${q}${force ? "&force=1" : ""}`, "GET");
      if (res.success) {
        setReport(res.data);
        setChecks(res.data.checks || []);
      } else {
        // 409 from the gate — the failing checks come back in the body so the
        // user sees exactly what to fix rather than a bare refusal.
        setChecks(res.data?.checks || []);
        setBlocked(true);
        setError(res.message);
      }
    } catch (e) {
      setError(e?.message || "Could not load the GSTR-1 report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(query); }, [query, load]);

  const submitFiling = async () => {
    setFiling(true);
    try {
      const res = await callAPI("gstr1/file", "POST", { period, arn: arn || null, notes: notes || null });
      if (res.success) {
        setFileOpen(false);
        setArn(""); setNotes("");
        flash(`GSTR-1 for ${periodLabel(period)} marked as filed.`);
        load(query);
      } else {
        flash(res.message || "Could not mark the period as filed");
      }
    } catch (e) {
      flash(e?.message || "Could not mark the period as filed");
    } finally {
      setFiling(false);
    }
  };

  const saveBlob = (text, filename, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * The upload file, built server-side in the GSTN schema.
   *
   * Deliberately NOT serialised from `report` — the on-screen sections are a
   * flattened view, and re-nesting them in the browser is exactly the kind of
   * second implementation that drifts. The server builds both from one set of
   * builders, so the file and the screen cannot disagree.
   */
  const downloadPortalJson = async () => {
    setDownloading(true);
    try {
      const res = await callAPI(`gstr1/portal-json?${query}${forced ? "&force=1" : ""}`, "GET");
      if (!res || res.success === false || !res.gstin) {
        flash(res?.message || "Could not build the portal JSON");
        return;
      }
      saveBlob(JSON.stringify(res, null, 2), gstr1FileName(report, "json"), "application/json");
    } catch (e) {
      flash(e?.message || "Could not build the portal JSON");
    } finally {
      setDownloading(false);
    }
  };

  const downloadExcel = () => {
    try {
      downloadGstr1Excel(report);
    } catch (e) {
      flash(e?.message || "Could not build the workbook");
    }
  };

  const s = report?.sections;
  const range = report?.range;
  const failCount = checks.filter((c) => c.status === "FAIL").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const alreadyFiled = checks.some((c) => c.id.startsWith("B1 ") && c.status === "FAIL");

  // Headline figures: every outward supply table, net of credit notes.
  const headline = useMemo(() => {
    if (!s) return { taxable: 0, tax: 0, docs: 0 };
    const taxable =
      taxableOf(s.b2b) + taxableOf(s.b2cl) + taxableOf(s.b2cs)
      - taxableOf(s.cdnr) - taxableOf(s.cdnur);
    const tax =
      taxOf(s.b2b) + taxOf(s.b2cl) + taxOf(s.b2cs) - taxOf(s.cdnr) - taxOf(s.cdnur);
    return { taxable, tax, docs: total(s.docs, "total_number") };
  }, [s]);

  return (
    <>
      <PageHeader
        title="GSTR-1"
        // The period itself is stated on the bar below, so it is not repeated here.
        sub={
          report?.filer
            ? `${report.filer.name} · ${report.filer.gstin}`
            : "Outward supplies return"
        }
        action={
          <div className="g1-actions">
            {report && (
              <>
                <Btn variant="ghost" disabled={downloading} onClick={() => { if (!downloading) downloadPortalJson(); }}>
                  {downloading ? "Building…" : "Download JSON"}
                </Btn>
                <Btn variant="ghost" onClick={downloadExcel}>Download Excel</Btn>
              </>
            )}
            {report && mode === "monthly" && !alreadyFiled && (
              <span title={failCount > 0 ? "Resolve the failing checks first" : "Mark this period as filed"}>
                <Btn
                  variant="primary"
                  disabled={failCount > 0}
                  // Btn styles `disabled` but does not set the attribute, so the
                  // click still fires — guard it here rather than rely on the class.
                  onClick={() => { if (failCount === 0) setFileOpen(true); }}
                >
                  Mark as filed
                </Btn>
              </span>
            )}
          </div>
        }
      />

      {/* ── Period selection ───────────────────────────────────────────────
          Deliberately NOT a <Card>: .ui-card sets overflow:hidden, which
          clips an open Dropdown panel at the card's edge. The bar carries the
          card's own styling instead, and its own stacking context, so the
          panel paints over the sections below rather than being cut off. */}
      <div className="g1-periodbar">
        <span className="g1-periodbar-label">Period</span>
        <Tabs tabs={MODES} active={mode} onChange={setMode} variant="pill" />
        <div className="g1-period-pickers">
          {mode === "monthly" && (
            <Dropdown value={period} onChange={setPeriod} options={periodOptions()} width="190px" />
          )}
          {mode !== "monthly" && (
            <Dropdown value={fy} onChange={setFy} options={fyOptions()} width="165px" />
          )}
          {mode === "quarterly" && (
            <Dropdown value={quarter} onChange={setQuarter} options={QUARTERS} width="175px" />
          )}
        </div>
        {range && (
          <span className="g1-periodbar-range">
            {range.label}
            <em>filing period {range.fp}</em>
          </span>
        )}
      </div>

      {loading && <Spinner overlay label="Building the return…" />}

      {/* ── Pre-filing gate ─────────────────────────────────────────────── */}
      {checks.length > 0 && (
        <Card
          title="Pre-filing checks"
          action={
            <span
              className="g1-gate-summary"
              style={{ color: failCount ? C.red : warnCount ? C.amber : C.green }}
            >
              {failCount ? `${failCount} blocking` : warnCount ? `${warnCount} to review` : "All clear"}
            </span>
          }
        >
          {failCount > 0 && (
            <p className="g1-gate-msg" style={{ color: C.red }}>
              This return cannot be generated until every blocking check passes. Nothing
              here is cosmetic — each one changes what gets filed.
            </p>
          )}
          <div className="g1-checks">
            {[...checks]
              .sort((a, b) => {
                const rank = { FAIL: 0, WARN: 1, PASS: 2 };
                return rank[a.status] - rank[b.status];
              })
              .map((c) => <CheckRow key={c.id} check={c} />)}
          </div>
          {blocked && (
            <Btn variant="ghost" className="g1-force" onClick={() => load(query, true)}>
              Show the return anyway (for inspection — do not file this)
            </Btn>
          )}
        </Card>
      )}

      {error && !blocked && <p className="g1-error">{error}</p>}

      {report?.unvalidated && (
        <div className="g1-banner g1-banner-warn">
          Generated with failing checks. These figures are for inspection only and must
          not be filed.
        </div>
      )}

      {range && range.portal_filable === false && (
        <div className="g1-banner g1-banner-warn">
          There is no annual GSTR-1. This view totals all twelve months of {range.label} for
          reconciliation; the JSON it produces is well-formed and will open in the offline
          utility, but uploading it would file a whole year's supplies into the single
          period {range.fp}. File month by month, or quarter by quarter under QRMP.
        </div>
      )}

      {range && range.mode === "quarterly" && (
        <div className="g1-banner g1-banner-info">
          Quarterly returns are for QRMP filers. The JSON declares period {range.fp} —
          the last month of the quarter — which is what the portal expects for a quarterly
          filing. A monthly filer should use the Monthly tab instead.
        </div>
      )}

      {alreadyFiled && (
        <div className="g1-banner g1-banner-info">
          {range?.label || periodLabel(period)} contains an already-filed period. Edits to
          those bills are blocked — corrections go through Table 10 amendments.
        </div>
      )}

      {report && s && (
        <>
          {/* ── Headline ─────────────────────────────────────────────────── */}
          <div className="g1-summary">
            <div className="g1-stat">
              <span className="g1-stat-label">Taxable value</span>
              <span className="g1-stat-value">{fmt(headline.taxable)}</span>
            </div>
            <div className="g1-stat">
              <span className="g1-stat-label">Total tax</span>
              <span className="g1-stat-value">{fmt(headline.tax)}</span>
            </div>
            <div className="g1-stat">
              <span className="g1-stat-label">Documents issued</span>
              <span className="g1-stat-value">{headline.docs}</span>
            </div>
            <div
              className="g1-stat"
              title="The supply tables and the HSN summary are the same lines grouped differently — they must agree exactly."
            >
              <span className="g1-stat-label">Supplies ↔ HSN</span>
              <span
                className="g1-stat-value"
                style={{ color: report.reconciliation.matches ? C.green : C.red }}
              >
                {report.reconciliation.matches
                  ? "Tied"
                  : `Off by ${fmt(Math.abs(report.reconciliation.difference))}`}
              </span>
            </div>
          </div>

          {/* ── Table 4A ─────────────────────────────────────────────────── */}
          <Section
            number="4A"
            title="B2B — supplies to registered persons"
            note="Invoices to customers holding a GSTIN, reported individually. One row per invoice and rate; a nil-rated line stays on its invoice so the invoice value still ties."
            columns={[
              { key: "ctin", label: "GSTIN" },
              { key: "name", label: "Receiver" },
              { key: "inv", label: "Invoice" },
              { key: "dt", label: "Date" },
              { key: "pos", label: "POS" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "tv", label: "Taxable value", numeric: true },
              { key: "igst", label: "IGST", numeric: true },
              { key: "cgst", label: "CGST", numeric: true },
              { key: "sgst", label: "SGST", numeric: true },
              { key: "val", label: "Invoice value", numeric: true },
            ]}
            rows={s.b2b}
            renderRow={(r, i) => (
              <tr key={`${r.invoice_number}-${r.rate}-${i}`}>
                <td>{r.ctin}</td>
                <td>{r.receiver_name}</td>
                <td>{r.invoice_number}</td>
                <td>{r.invoice_date_label}</td>
                <td>{r.place_of_supply_label}</td>
                <td className="g1-num">{fmtNum(Number(r.rate))}%</td>
                <td className="g1-num">{fmt(r.taxable_value)}</td>
                <td className="g1-num">{fmt(r.igst)}</td>
                <td className="g1-num">{fmt(r.cgst)}</td>
                <td className="g1-num">{fmt(r.sgst)}</td>
                <td className="g1-num">{fmt(r.invoice_value)}</td>
              </tr>
            )}
          />

          {/* ── Table 5 ──────────────────────────────────────────────────── */}
          <Section
            number="5"
            title="B2C Large"
            note="Inter-state sales to unregistered persons above the per-invoice threshold, reported individually."
            columns={[
              { key: "inv", label: "Invoice" },
              { key: "dt", label: "Date" },
              { key: "pos", label: "POS" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "tv", label: "Taxable value", numeric: true },
              { key: "igst", label: "IGST", numeric: true },
              { key: "val", label: "Invoice value", numeric: true },
            ]}
            rows={s.b2cl}
            renderRow={(r, i) => (
              <tr key={`${r.invoice_number}-${r.rate}-${i}`}>
                <td>{r.invoice_number}</td>
                <td>{r.invoice_date_label}</td>
                <td>{r.place_of_supply_label}</td>
                <td className="g1-num">{fmtNum(Number(r.rate))}%</td>
                <td className="g1-num">{fmt(r.taxable_value)}</td>
                <td className="g1-num">{fmt(r.igst)}</td>
                <td className="g1-num">{fmt(r.invoice_value)}</td>
              </tr>
            )}
          />

          {/* ── Table 7 ──────────────────────────────────────────────────── */}
          <Section
            number="7"
            title="B2C Others"
            note="All other sales to unregistered persons, consolidated by place of supply and rate, net of any credit note too small to report separately."
            columns={[
              { key: "ty", label: "Supply" },
              { key: "pos", label: "Place of supply" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "tv", label: "Taxable value", numeric: true },
              { key: "igst", label: "IGST", numeric: true },
              { key: "cgst", label: "CGST", numeric: true },
              { key: "sgst", label: "SGST", numeric: true },
              { key: "cess", label: "Cess", numeric: true },
            ]}
            rows={s.b2cs}
            renderRow={(r, i) => (
              <tr key={`${r.place_of_supply}-${r.rate}-${i}`}>
                <td>{r.supply_type}</td>
                <td>{r.place_of_supply_label}</td>
                <td className="g1-num">{fmtNum(Number(r.rate))}%</td>
                <td className="g1-num" style={r.taxable_value < 0 ? { color: C.red } : undefined}>
                  {fmt(r.taxable_value)}
                </td>
                <td className="g1-num">{fmt(r.igst)}</td>
                <td className="g1-num">{fmt(r.cgst)}</td>
                <td className="g1-num">{fmt(r.sgst)}</td>
                <td className="g1-num">{fmt(r.cess)}</td>
              </tr>
            )}
            total={
              s.b2cs.length > 0 && (
                <>
                  <td colSpan={3}>Total</td>
                  <td className="g1-num">{fmt(total(s.b2cs, "taxable_value"))}</td>
                  <td className="g1-num">{fmt(total(s.b2cs, "igst"))}</td>
                  <td className="g1-num">{fmt(total(s.b2cs, "cgst"))}</td>
                  <td className="g1-num">{fmt(total(s.b2cs, "sgst"))}</td>
                  <td className="g1-num">{fmt(total(s.b2cs, "cess"))}</td>
                </>
              )
            }
          />

          {/* ── Table 8 ──────────────────────────────────────────────────── */}
          <Section
            number="8"
            title="Nil rated, exempted and non-GST supplies"
            note="Supply type is derived from the GST rate, so 0% reports as nil rated. Exempted and non-GST are not tracked separately."
            columns={[
              { key: "desc", label: "Description" },
              { key: "nil", label: "Nil rated", numeric: true },
              { key: "exempt", label: "Exempted", numeric: true },
              { key: "non", label: "Non-GST", numeric: true },
            ]}
            rows={s.nil}
            renderRow={(r) => (
              <tr key={r.supply_type}>
                <td>{r.description}</td>
                <td className="g1-num">{fmt(r.nil_rated)}</td>
                <td className="g1-num">{fmt(r.exempted)}</td>
                <td className="g1-num">{fmt(r.non_gst)}</td>
              </tr>
            )}
          />

          {/* ── Table 9B — CDNR ──────────────────────────────────────────── */}
          <Section
            number="9B"
            title="Credit notes — registered persons (CDNR)"
            note="Sales returns against a customer holding a GSTIN."
            columns={[
              { key: "ctin", label: "GSTIN" },
              { key: "name", label: "Receiver" },
              { key: "nt", label: "Note" },
              { key: "dt", label: "Date" },
              { key: "pos", label: "POS" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "tv", label: "Taxable value", numeric: true },
              { key: "tax", label: "Tax", numeric: true },
              { key: "val", label: "Note value", numeric: true },
            ]}
            rows={s.cdnr}
            renderRow={(r, i) => (
              <tr key={`${r.note_number}-${r.rate}-${i}`}>
                <td>{r.ctin}</td>
                <td>{r.receiver_name}</td>
                <td>{r.note_number}</td>
                <td>{r.note_date_label}</td>
                <td>{r.place_of_supply_label}</td>
                <td className="g1-num">{fmtNum(Number(r.rate))}%</td>
                <td className="g1-num">{fmt(r.taxable_value)}</td>
                <td className="g1-num">
                  {fmt(Number(r.igst) + Number(r.cgst) + Number(r.sgst) + Number(r.cess))}
                </td>
                <td className="g1-num">{fmt(r.note_value)}</td>
              </tr>
            )}
          />

          {/* ── Table 9B — CDNUR ─────────────────────────────────────────── */}
          <Section
            number="9B"
            title="Credit notes — unregistered persons (CDNUR)"
            note="Sales returns against an unregistered buyer, inter-state and above the B2C-Large threshold. Smaller returns are netted into Table 7 instead."
            columns={[
              { key: "typ", label: "Type" },
              { key: "nt", label: "Note" },
              { key: "dt", label: "Date" },
              { key: "pos", label: "POS" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "tv", label: "Taxable value", numeric: true },
              { key: "igst", label: "IGST", numeric: true },
              { key: "val", label: "Note value", numeric: true },
            ]}
            rows={s.cdnur}
            renderRow={(r, i) => (
              <tr key={`${r.note_number}-${r.rate}-${i}`}>
                <td>{r.ur_type}</td>
                <td>{r.note_number}</td>
                <td>{r.note_date_label}</td>
                <td>{r.place_of_supply_label}</td>
                <td className="g1-num">{fmtNum(Number(r.rate))}%</td>
                <td className="g1-num">{fmt(r.taxable_value)}</td>
                <td className="g1-num">{fmt(r.igst)}</td>
                <td className="g1-num">{fmt(r.note_value)}</td>
              </tr>
            )}
          />

          {/* ── Table 12 ─────────────────────────────────────────────────── */}
          {[
            { key: "hsn_b2b", label: "HSN summary — B2B", note: "The B2B invoices above, grouped by HSN instead of by recipient." },
            { key: "hsn_b2c", label: "HSN summary — B2C", note: "The B2CL and B2CS supplies above, grouped by HSN. Credit notes are subtracted here too, so the totals move with the supply tables." },
          ].map(({ key, label, note }) => (
            <Section
              key={key}
              number="12"
              title={label}
              note={note}
              columns={[
                { key: "hsn", label: "HSN" },
                { key: "desc", label: "Description" },
                { key: "uqc", label: "UQC" },
                { key: "qty", label: "Quantity", numeric: true },
                { key: "rate", label: "Rate", numeric: true },
                { key: "tv", label: "Taxable value", numeric: true },
                { key: "tax", label: "Tax", numeric: true },
                { key: "tot", label: "Total value", numeric: true },
              ]}
              rows={s[key]}
              renderRow={(r, i) => (
                <tr key={`${r.hsn_code}-${r.uqc}-${r.rate}-${i}`}>
                  <td>{r.hsn_code || <span className="g1-missing">not set</span>}</td>
                  <td>{r.description}</td>
                  <td>{r.uqc_label || <span className="g1-missing">not set</span>}</td>
                  <td className="g1-num">{fmtNum(Number(r.total_quantity))}</td>
                  <td className="g1-num">{fmtNum(Number(r.rate))}%</td>
                  <td className="g1-num">{fmt(r.taxable_value)}</td>
                  <td className="g1-num">
                    {fmt(Number(r.igst) + Number(r.cgst) + Number(r.sgst) + Number(r.cess))}
                  </td>
                  <td className="g1-num">{fmt(r.total_value)}</td>
                </tr>
              )}
            />
          ))}

          {/* ── Table 13 ─────────────────────────────────────────────────── */}
          <Section
            number="13"
            title="Documents issued"
            note="Every document number consumed in the period, including cancelled ones — a cancelled number can never be reissued."
            columns={[
              { key: "type", label: "Nature of document" },
              { key: "from", label: "From" },
              { key: "to", label: "To" },
              { key: "tot", label: "Total", numeric: true },
              { key: "can", label: "Cancelled", numeric: true },
              { key: "net", label: "Net issued", numeric: true },
            ]}
            rows={s.docs}
            renderRow={(r, i) => (
              <tr key={`${r.doc_num}-${r.series}-${i}`}>
                <td>{r.document_type}</td>
                <td>{r.from_no}</td>
                <td>{r.to_no}</td>
                <td className="g1-num">{r.total_number}</td>
                <td className="g1-num">{r.cancelled}</td>
                <td className="g1-num">{r.net_issued}</td>
              </tr>
            )}
          />
        </>
      )}

      {!loading && !report && !blocked && !error && (
        <EmptyState
          icon="📄"
          title="No return for this period"
          sub="Pick a different period, or check that sales have been recorded."
        />
      )}

      {/* ── Mark as filed ────────────────────────────────────────────────── */}
      <Modal open={fileOpen} onClose={() => setFileOpen(false)} title={`Mark ${periodLabel(period)} as filed`} width={480}>
        <p className="g1-modal-warn">
          This snapshots the figures above and locks every bill dated in {periodLabel(period)}.
          After this, those bills can no longer be edited or cancelled — corrections have to
          go through a Table 10 amendment. Do this only once the return is actually filed on
          the portal.
        </p>
        <Field label="ARN (from the portal)">
          <input value={arn} onChange={(e) => setArn(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        <div className="g1-modal-actions">
          <Btn variant="ghost" onClick={() => setFileOpen(false)}>Cancel</Btn>
          <Btn variant="primary" disabled={filing} onClick={() => { if (!filing) submitFiling(); }}>
            {filing ? "Saving…" : "Confirm filed"}
          </Btn>
        </div>
      </Modal>

      {toast && <div className="g1-toast">{toast}</div>}
    </>
  );
}
