// End-to-end smoke test: boots the real Express app and hits the real routes
// over HTTP with a real JWT. Read-only — no POST /gstr1/file here.
require("dotenv").config({ path: __dirname + "/../.env" });
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const app = express();
app.use(express.json());
app.use("/api/", require("../routes/gstr1"));

const token = jwt.sign({ id: 1, name: "smoke" }, process.env.JWT_SECRET || "secret", { expiresIn: "5m" });

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api`;
  const call = async (path) => {
    const r = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  };

  console.log("AUTH");
  const noAuth = await fetch(`${base}/gstr1/validate?period=052026`);
  console.log(`  no token -> ${noAuth.status} (expect 401)\n`);

  const [periods] = await pool.query(
    "SELECT DISTINCT DATE_FORMAT(`date`,'%m%Y') p FROM `transaction` WHERE `date` IS NOT NULL ORDER BY p"
  );
  // 052026 has purchases; 082026 has nothing at all — both worth exercising.
  const toTest = [...new Set([...periods.map((r) => r.p), "082026"])];

  for (const p of toTest) {
    console.log("═".repeat(68));
    console.log("PERIOD", p);

    const v = await call(`/gstr1/validate?period=${p}`);
    console.log(`  validate -> ${v.status}  can_file=${v.body.data?.can_file}  warnings=${v.body.data?.warnings}`);
    for (const c of v.body.data?.checks || []) {
      if (c.status !== "PASS") console.log(`     ${c.status}  ${c.id}: ${c.detail}`);
    }

    const r = await call(`/gstr1/report?period=${p}`);
    console.log(`  report   -> ${r.status}`);
    const s = r.body.data?.sections;
    if (s) {
      console.log(`     4A b2b   : ${s.b2b.length} rows`);
      console.log(`     5  b2cl  : ${s.b2cl.length} rows`);
      console.log(`     7  b2cs  : ${s.b2cs.length} rows  ${JSON.stringify(s.b2cs)}`);
      console.log(`     8  nil   : ${JSON.stringify(s.nil)}`);
      console.log(`     9B cdnr  : ${s.cdnr.length} rows   cdnur: ${s.cdnur.length} rows`);
      console.log(`     12 hsn   : b2b ${s.hsn_b2b.length} / b2c ${s.hsn_b2c.length} rows`);
      console.log(`     13 docs  : ${JSON.stringify(s.docs)}`);
      console.log(`     reconcile: ${JSON.stringify(r.body.data.reconciliation)}`);

      // The upload payload has to come out of the same period cleanly.
      const j = await call(`/gstr1/portal-json?period=${p}`);
      console.log(`  portal   -> ${j.status}  keys=${Object.keys(j.body).join(",")}`);
    } else {
      console.log(`     ${JSON.stringify(r.body).slice(0, 300)}`);
    }
  }

  // ── Quarterly and yearly ranges over the same data ──────────────────────
  console.log("═".repeat(68));
  console.log("RANGES");
  for (const q of ["mode=quarterly&fy=2026&quarter=1", "mode=quarterly&fy=2026&quarter=2",
                   "mode=yearly&fy=2026"]) {
    const r = await call(`/gstr1/report?${q}`);
    const d = r.body.data;
    console.log(`  ${q}\n     -> ${r.status} ${d?.range?.label || r.body.message || ""}`);
    if (d?.sections) {
      console.log(`     fp=${d.range.fp} filable=${d.range.portal_filable} months=${d.range.months.length}` +
                  `  b2b=${d.sections.b2b.length} b2cs=${d.sections.b2cs.length}` +
                  `  hsn=${d.sections.hsn_b2b.length}/${d.sections.hsn_b2c.length}` +
                  `  tied=${d.reconciliation.matches}`);
    }
  }

  // ── Contract: every field GSTR1Report.jsx reads must exist ──────────────
  // Section rows are empty on live data, so row-level keys are covered by the
  // fixture tests in gstr1.test.js. This pins the envelope, which is where
  // backend/frontend drift actually happens.
  console.log("═".repeat(68));
  console.log("FRONTEND CONTRACT (pages/GSTR1Report.jsx)");
  const contract = await call("/gstr1/report?period=052026");
  const d = contract.body.data;
  const problems = [];
  const need = (cond, what) => { if (!cond) problems.push(what); };

  need(d && typeof d === "object", "data");
  need(d?.filer && "name" in d.filer && "gstin" in d.filer, "filer.name / filer.gstin");
  need(Array.isArray(d?.checks) && d.checks.every((c) => c.id && c.status && "detail" in c),
       "checks[].id/status/detail");
  need(d?.reconciliation && "matches" in d.reconciliation && "difference" in d.reconciliation,
       "reconciliation.matches / .difference");
  need(d?.range && d.range.mode && d.range.label && d.range.fp,
       "range.mode / .label / .fp");
  for (const k of ["b2b", "b2cl", "b2cs", "nil", "cdnr", "cdnur", "hsn_b2b", "hsn_b2c", "docs"]) {
    need(Array.isArray(d?.sections?.[k]), `sections.${k} is an array`);
  }
  // Table 8 is synthesised, so its two rows exist even at nil — the page
  // renders them unconditionally and would show blanks if they vanished.
  const t8 = d?.sections?.nil || [];
  need(t8.length === 2, "nil always returns 2 description rows");
  need(t8.every((r) => "description" in r && "nil_rated" in r && "exempted" in r && "non_gst" in r),
       "nil row keys");
  // The B1 check id is parsed by the page to detect an already-filed period.
  need(d?.checks?.some((c) => c.id.startsWith("B1 ")), "a check id starting 'B1 '");

  if (problems.length) {
    console.log("  BROKEN:");
    problems.forEach((p) => console.log("    - " + p));
    process.exitCode = 1;
  } else {
    console.log("  OK — all fields the GSTR-1 screen reads are present");
  }

  console.log("═".repeat(68));
  console.log("BAD INPUT");
  for (const bad of ["", "5-2026", "132026", "052026x", "002026"]) {
    const r = await call(`/gstr1/validate?period=${encodeURIComponent(bad)}`);
    console.log(`  period='${bad}' -> ${r.status} ${r.body.message || ""}`);
  }
  const t10 = await call("/gstr1/table10?period=052026");
  console.log(`  table10 unfiled  -> ${t10.status} ${t10.body.message || ""}`);

  // Why Table 13 ranges are computed in JS and not in SQL. Both SQL strategies
  // below are wrong on real data:
  //   lexical MIN/MAX  -> '#' series reports 187..83, backwards
  //   trailing-digit   -> 'AFF-#/#-#' collapses, because every bill ends '27'
  // naturalCompare() in routes/gstr1.js handles both. Kept as a regression
  // exhibit against anyone tempted to push this back down into SQL.
  console.log("═".repeat(68));
  console.log("TABLE 13 — why the SQL approaches were rejected (read-only)");
  const [t13] = await pool.query(`
    SELECT REGEXP_REPLACE(bill_no,'[0-9]+','#') AS series,
           SUBSTRING_INDEX(GROUP_CONCAT(bill_no ORDER BY CAST(REGEXP_SUBSTR(bill_no,'[0-9]+$') AS UNSIGNED) ASC),',',1)  AS from_no,
           SUBSTRING_INDEX(GROUP_CONCAT(bill_no ORDER BY CAST(REGEXP_SUBSTR(bill_no,'[0-9]+$') AS UNSIGNED) DESC),',',1) AS to_no,
           MIN(bill_no) AS lexical_min, MAX(bill_no) AS lexical_max, COUNT(*) n
      FROM \`transaction\` WHERE trans_type='PI' GROUP BY series ORDER BY series`);
  console.table(t13);

  server.close();
  await pool.end();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
