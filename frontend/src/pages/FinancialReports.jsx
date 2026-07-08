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
    <p className="fr-section-label" style={{ color }}>
      {children}
    </p>
  );
}

function Row({ label, value, color, bold, sub, indent }) {
  return (
    <div className={`fr-row ${indent ? "fr-row-indent" : ""}`}>
      <span className={`fr-row-label ${bold ? "fr-row-label-bold" : ""}`}>
        {label}
        {sub && <span className="fr-row-sub">{sub}</span>}
      </span>
      <span className={`fr-row-value ${bold ? "fr-row-value-bold" : ""}`} style={{ color: color || C.text }}>
        {fmt(Math.abs(value || 0))}
      </span>
    </div>
  );
}

function NetBox({ label, value, positive }) {
  const isPos = positive ?? value >= 0;
  return (
    <div className={`fr-netbox ${isPos ? "fr-netbox-pos" : "fr-netbox-neg"}`}>
      <span className="fr-netbox-label">{label}</span>
      <span className="fr-netbox-value">
        {value < 0 ? "−" : ""}{fmt(Math.abs(value || 0))}
      </span>
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="fr-minibar">
      <div className="fr-minibar-head">
        <span className="fr-minibar-label">{label}</span>
        <span className="fr-minibar-value">{fmt(value)}</span>
      </div>
      <div className="fr-minibar-track">
        <div className="fr-minibar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MonthChart({ data }) {
  if (!data || data.length === 0) return (
    <div className="fr-monthchart-empty">No data for period</div>
  );

  const maxVal = Math.max(...data.flatMap(d => [d.sales, d.purchases]), 1);
  const barW = Math.max(18, Math.min(36, Math.floor(460 / data.length / 2 - 4)));
  const gap  = barW + 4;

  return (
    <div className="fr-monthchart-wrap">
      <div className="fr-monthchart-bars" style={{ minWidth: data.length * (gap * 2 + 8) }}>
        {data.map((d, i) => {
          const sH = Math.round((d.sales     / maxVal) * 110);
          const pH = Math.round((d.purchases / maxVal) * 110);
          const label = d.month.slice(5); // MM
          return (
            <div key={i} className="fr-month-col">
              <div className="fr-month-bars-row">
                <div title={`Sales: ${fmt(d.sales)}`} className="fr-bar fr-bar-sales" style={{ width: barW, height: sH || 3 }} />
                <div title={`Purchases: ${fmt(d.purchases)}`} className="fr-bar fr-bar-purchases" style={{ width: barW, height: pH || 3 }} />
              </div>
              <span className="fr-month-label">{label}</span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="fr-legend">
        <div className="fr-legend-item"><div className="fr-legend-dot fr-legend-dot-sales" />Sales</div>
        <div className="fr-legend-item"><div className="fr-legend-dot fr-legend-dot-purchases" />Purchases</div>
      </div>
    </div>
  );
}

function StatPill({ label, value, icon, color, bg }) {
  return (
    <div className="fr-statpill" style={{ background: bg || C.accentBg, borderColor: (color || C.accent) + "22" }}>
      <span className="fr-statpill-icon">{icon}</span>
      <div>
        <div className="fr-statpill-label">{label}</div>
        <div className="fr-statpill-value" style={{ color: color || C.accent }}>{value}</div>
      </div>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="u-alert-error">
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
      <div className={`fr-loading-wrap ${loading && !data ? "fr-loading-wrap-tall" : ""}`}>
        {loading && !data && (
          <div className="fr-loading-center">
            <Spinner size={36} />
          </div>
        )}

        {data && (
          <>
            {/* ── KPI Pills ─────────────────────────────────────────────── */}
            <div className="stat-grid u-mb20">
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
                icon={pl.net_profit >= 0 ? "📈" : "📉"} label= {pl.net_profit >= 0 ?"Net Profit" : "Net Loss"}
                value={fmt(Math.abs(pl.net_profit ?? 0))}
                color={pl.net_profit >= 0 ? C.green : C.red}
                bg={pl.net_profit >= 0 ? C.greenBg : C.redBg}
              />
            </div>

            {/* ── P&L + Balance Sheet ───────────────────────────────────── */}
            <div className="fin-grid u-mb20">

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
                  label={(pl.sales_gst||0) - (pl.purchase_gst||0) >= 0 ? "Net GST Payable" : "Net GST Receivable"}
                  value={(pl.sales_gst||0) - (pl.purchase_gst||0)}
                  color={(pl.sales_gst||0) - (pl.purchase_gst||0) >= 0 ? C.red : C.green}
                  bold
                />

                <div className="fr-block-mt">
                  <NetBox label={pl.gross_profit > 0 ? "Gross Profit": "Gross Loss"} value={pl.gross_profit} />
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

                <div className="fr-block-mt">
                  <div className="fr-equity-box">
                    <span className="fr-equity-label">Owner's Equity</span>
                    <span className="fr-equity-value">
                      {fmt(bs.equity ?? 0)}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* ── Monthly trend + top tables ─────────────────────────────── */}
            <div className="fin-grid u-mb20">

              {/* Monthly Chart */}
              <Card title="📅 Monthly Sales vs Purchases">
                <MonthChart data={monthly} />
              </Card>

              {/* Top Products + Top Customers */}
              <div className="fr-side-stack">
                <Card title="🏆 Top Products by Sales">
                  {topProducts.length === 0
                    ? <span className="u-hint u-fs12">No sales data for period</span>
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
                    ? <span className="u-hint u-fs12">No sales data for period</span>
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
          <div className="fr-refresh-toast">
            <Spinner size={14} />
            Refreshing…
          </div>
        )}
      </div>
    </div>
  );
}