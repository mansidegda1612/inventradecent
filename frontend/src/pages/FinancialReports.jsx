import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Card, PageHeader, DateFilter, Spinner } from "../components/ui";
import { callAPI } from "../utils/callserver";

// ─── helpers ────────────────────────────────────────────────────────────────
function defaultFrom() { return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10); }
function defaultTo()   { return new Date().toISOString().slice(0, 10); }

// ─── sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ children, color = C.green }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 800, color,
      textTransform: "uppercase", letterSpacing: ".09em",
      marginBottom: 8, marginTop: 14,
    }}>
      {children}
    </p>
  );
}

function Row({ label, value, color, bold, sub, indent }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0", borderBottom: `1px solid ${C.borderLight}`,
      paddingLeft: indent ? 14 : 0,
    }}>
      <span style={{ color: bold ? C.text : C.muted, fontSize: 13, fontWeight: bold ? 700 : 400 }}>
        {label}
        {sub && <span style={{ fontSize: 11, color: C.hint, marginLeft: 6 }}>{sub}</span>}
      </span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || C.text, fontSize: bold ? 14 : 13 }}>
        {fmt(Math.abs(value || 0))}
      </span>
    </div>
  );
}

function NetBox({ label, value, positive }) {
  const isPos = positive ?? value >= 0;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 16px", marginTop: 10,
      background: isPos ? C.greenBg : C.redBg,
      borderRadius: 10, border: `1px solid ${isPos ? C.green : C.red}30`,
    }}>
      <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>{label}</span>
      <span style={{ fontWeight: 900, fontSize: 20, color: isPos ? C.green : C.red }}>
        {value < 0 ? "−" : ""}{fmt(Math.abs(value || 0))}
      </span>
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmt(value)}</span>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

function MonthChart({ data }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign: "center", padding: "30px 0", color: C.hint, fontSize: 13 }}>No data for period</div>
  );

  const maxVal = Math.max(...data.flatMap(d => [d.sales, d.purchases]), 1);
  const barW = Math.max(18, Math.min(36, Math.floor(460 / data.length / 2 - 4)));
  const gap  = barW + 4;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, minHeight: 130, minWidth: data.length * (gap * 2 + 8) }}>
        {data.map((d, i) => {
          const sH = Math.round((d.sales     / maxVal) * 110);
          const pH = Math.round((d.purchases / maxVal) * 110);
          const label = d.month.slice(5); // MM
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
                <div title={`Sales: ${fmt(d.sales)}`} style={{
                  width: barW, height: sH || 3,
                  background: C.green, borderRadius: "3px 3px 0 0",
                  transition: "height .4s ease", cursor: "default",
                }} />
                <div title={`Purchases: ${fmt(d.purchases)}`} style={{
                  width: barW, height: pH || 3,
                  background: C.accent + "99", borderRadius: "3px 3px 0 0",
                  transition: "height .4s ease", cursor: "default",
                }} />
              </div>
              <span style={{ fontSize: 9, color: C.hint, fontWeight: 600 }}>{label}</span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
        {[{ label: "Sales", color: C.green }, { label: "Purchases", color: C.accent + "99" }].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted }}>
            <div style={{ width: 10, height: 10, background: l.color, borderRadius: 3 }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatPill({ label, value, icon, color, bg }) {
  return (
    <div style={{
      background: bg || C.accentBg,
      borderRadius: 10, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10,
      border: `1px solid ${color || C.accent}22`,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: color || C.accent }}>{value}</div>
      </div>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div style={{
      padding: "18px 20px", background: C.redBg,
      border: `1px solid ${C.red}33`, borderRadius: 10,
      color: C.red, fontSize: 13, fontWeight: 600,
    }}>
      ⚠️ {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function FinancialReports() {
  const [from, setFrom]     = useState(defaultFrom);
  const [to, setTo]         = useState(defaultTo);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to",   to);
      const res = await callAPI(`reports/financial?${params}`, "GET");
      if (res?.success) {
        setData(res.data);
      } else {
        setError(res?.message || "Failed to load report data");
      }
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // load on mount and when dates change
  useEffect(() => { loadData(); }, [loadData]);

  const pl = data?.pl  || {};
  const bs = data?.bs  || {};
  const monthly      = data?.monthly       || [];
  const topProducts  = data?.top_products  || [];
  const topCustomers = data?.top_customers || [];

  const maxProductVal  = topProducts[0]?.value  || 1;
  const maxCustomerVal = topCustomers[0]?.value || 1;

  return (
    <div>
      <PageHeader
        title="Financial Reports"
        sub="Live Profit & Loss and Balance Sheet from your transaction data."
      />

      {/* Date filter */}
      <DateFilter
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        totalLabel="Net Profit"
        totalValue={data ? fmt(pl.net_profit ?? 0) : "—"}
      />

      {/* Error */}
      {error && <ErrorBox message={error} />}

      {/* Loading overlay wrapper */}
      <div style={{ position: "relative", minHeight: loading && !data ? 300 : "auto" }}>
        {loading && !data && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Spinner size={36} />
          </div>
        )}

        {data && (
          <>
            {/* ── KPI Pills ─────────────────────────────────────────────── */}
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              <StatPill
                icon="🧾" label="Sales Bills"
                value={pl.bill_count_sales ?? 0}
                color={C.green} bg={C.greenBg}
              />
              <StatPill
                icon="📦" label="Purchase Bills"
                value={pl.bill_count_purchases ?? 0}
                color={C.accent} bg={C.accentBg}
              />
              <StatPill
                icon="📊" label="Total Revenue"
                value={fmt(pl.sales_revenue ?? 0)}
                color={C.green} bg={C.greenBg}
              />
              <StatPill
                icon={pl.net_profit >= 0 ? "📈" : "📉"} label="Net Profit"
                value={fmt(Math.abs(pl.net_profit ?? 0))}
                color={pl.net_profit >= 0 ? C.green : C.red}
                bg={pl.net_profit >= 0 ? C.greenBg : C.redBg}
              />
            </div>

            {/* ── P&L + Balance Sheet ───────────────────────────────────── */}
            <div className="fin-grid" style={{ marginBottom: 20 }}>

              {/* Profit & Loss */}
              <Card title="📊 Profit & Loss Statement">
                <SectionLabel color={C.green}>Income</SectionLabel>
                <Row label="Sales Revenue"     value={pl.sales_revenue}   color={C.green} />
                <Row label="Less: Discounts Given" value={pl.sales_discount} color={C.red} indent />
                <Row label="Net Sales"         value={(pl.sales_revenue||0) - (pl.sales_discount||0)} color={C.green} bold />

                <SectionLabel color={C.red}>Cost of Goods</SectionLabel>
                <Row label="Purchase Cost"     value={pl.purchase_cost}     color={C.red} />
                <Row label="Less: Discounts Received" value={pl.purchase_discount} color={C.green} indent />
                <Row label="Net Purchase Cost" value={(pl.purchase_cost||0) - (pl.purchase_discount||0)} color={C.red} bold />

                <SectionLabel color={C.amber}>GST Summary</SectionLabel>
                <Row label="Output GST (Collected)"  value={pl.sales_gst}    color={C.amber} />
                <Row label="Input GST (Paid)"         value={pl.purchase_gst} color={C.amber} />
                <Row
                  label="Net GST Payable"
                  value={(pl.sales_gst||0) - (pl.purchase_gst||0)}
                  color={(pl.sales_gst||0) - (pl.purchase_gst||0) >= 0 ? C.red : C.green}
                  bold
                />

                <div style={{ marginTop: 14 }}>
                  <NetBox label="Gross Profit" value={pl.gross_profit} />
                </div>
              </Card>

              {/* Balance Sheet */}
              <Card title="🏦 Balance Sheet">
                <SectionLabel color={C.green}>Assets</SectionLabel>
                <Row label="Inventory / Stock"    value={bs.assets?.stock_value}         color={C.green} />
                <Row label="Accounts Receivable"  value={bs.assets?.accounts_receivable} color={C.blue}  />
                <Row label="Cash & Bank (Sales)"  value={bs.assets?.cash_and_bank}       color={C.blue}  />
                <Row label="Total Assets"         value={bs.assets?.total}               color={C.green} bold />

                <SectionLabel color={C.red}>Liabilities</SectionLabel>
                <Row label="Accounts Payable"     value={bs.liabilities?.accounts_payable} color={C.red} />
                <Row label="Net GST Payable"      value={bs.liabilities?.gst_payable}      color={C.red} />
                <Row label="Total Liabilities"    value={bs.liabilities?.total}            color={C.red}  bold />

                <div style={{ marginTop: 14 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px",
                    background: C.accentBg, borderRadius: 10,
                    border: `1px solid ${C.accent}22`,
                  }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>Owner's Equity</span>
                    <span style={{ fontWeight: 900, fontSize: 20, color: C.accent }}>
                      {fmt(bs.equity ?? 0)}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* ── Monthly trend + top tables ─────────────────────────────── */}
            <div className="fin-grid" style={{ marginBottom: 20 }}>

              {/* Monthly Chart */}
              <Card title="📅 Monthly Sales vs Purchases">
                <MonthChart data={monthly} />
              </Card>

              {/* Top Products + Top Customers */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Card title="🏆 Top Products by Sales">
                  {topProducts.length === 0
                    ? <span style={{ fontSize: 13, color: C.hint }}>No sales data for period</span>
                    : topProducts.map((p, i) => (
                      <MiniBar
                        key={i} label={p.name}
                        value={p.value} max={maxProductVal}
                        color={C.accent}
                      />
                    ))
                  }
                </Card>

                <Card title="👥 Top Customers by Sales">
                  {topCustomers.length === 0
                    ? <span style={{ fontSize: 13, color: C.hint }}>No sales data for period</span>
                    : topCustomers.map((c, i) => (
                      <MiniBar
                        key={i} label={`${c.name}  (${c.bills} bill${c.bills !== 1 ? "s" : ""})`}
                        value={c.value} max={maxCustomerVal}
                        color={C.green}
                      />
                    ))
                  }
                </Card>
              </div>
            </div>
          </>
        )}

        {/* Subtle loading overlay when refreshing existing data */}
        {loading && data && (
          <div style={{
            position: "fixed", bottom: 24, right: 24,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12, color: C.muted,
            boxShadow: "0 4px 16px #00000012", zIndex: 100,
          }}>
            <Spinner size={14} />
            Refreshing…
          </div>
        )}
      </div>
    </div>
  );
}