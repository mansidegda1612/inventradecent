import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/theme";
import { fmt, fmtDateISO } from "../utils/format";
import { callAPI } from "../utils/callserver";
import {
  Btn, Badge, PageHeader, DateFilter, Spinner, DataGrid,
} from "../components/ui";

// ─── helpers ──────────────────────────────────────────────────────────────────
function defaultFrom() {
  const now = new Date();
  return fmtDateISO(new Date(now.getFullYear(), 0, 1));
}
function defaultTo() {
  return fmtDateISO(new Date());
}

// ─── small stock-status badge ─────────────────────────────────────────────────
function StockBadge({ qty }) {
  const qty_n = Number(qty) || 0;
  if (qty_n <= 0) return <Badge color={C.red}>Out of Stock</Badge>;
  if (qty_n < 10) return <Badge color={C.amber}>Low Stock</Badge>;
  return <Badge color={C.green}>In Stock</Badge>;
}

// ─── stat chip (used in DataGrid footerExtra) ─────────────────────────────────
function StatChip({ label, value, color = C.accent }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: C.card, border: `1.5px solid ${C.border}`,
      borderRadius: 10, padding: "6px 14px",
      boxShadow: "0 1px 4px #00000008",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".07em" }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13, fontWeight: 700, color,
      }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function InventoryReports() {
  const [tab, setTab] = useState("stock");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const [stockData, setStockData] = useState([]);
  const [movementData, setMovementData] = useState([]);
  const [lowData, setLowData] = useState([]);
  const [summary, setSummary] = useState(null);   // { totalStockValue, lowCount, outCount }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── load data whenever tab / date range changes ───────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "stock") {
        const data = await callAPI("reports/inventory/current-stock", "GET");
        setStockData((data?.rows || []).map((r, i) => ({ ...r, id: r.id ?? i })));
        setSummary(data?.summary || null);

      } else if (tab === "movement") {
        const data = await callAPI(
          `reports/inventory/stock-movement?from=${from}&to=${to}`, "GET"
        );
        setMovementData((data?.rows || []).map((r, i) => ({ ...r, id: r.id ?? i })));

      } else if (tab === "low") {
        const data = await callAPI("reports/inventory/low-stock", "GET");
        setLowData((data?.rows || []).map((r, i) => ({ ...r, id: r.id ?? i })));
        setSummary(data?.summary || null);
      }
    } catch (e) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [tab, from, to]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── TABS config ───────────────────────────────────────────────────────────
  const TABS = [
    { key: "stock", label: "📦 Current Stock" },
    { key: "movement", label: "🔄 Stock Movement" },
    { key: "low", label: "⚠️ Low Stock" },
  ];

  // ── Current Stock columns ─────────────────────────────────────────────────
  const stockCols = [
    {
      key: "name", label: "Product",
      render: v => <span style={{ fontWeight: 600, color: C.text }}>{v}</span>,
    },
    {
      key: "category", label: "Category",
      render: v => <Badge color={C.blue}>{v || "—"}</Badge>,
    },
    {
      key: "barcode", label: "Barcode",
      render: v => (
        <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
          {v || "—"}
        </span>
      ),
    },
    {
      key: "purc_rate", label: "Purchase Rate",
      render: v => <span>{fmt(v)}</span>,
    },
    {
      key: "sale_rate", label: "Sale Rate",
      render: v => <span >{fmt(v)}</span>,
    },
    {
      key: "c_qty", label: "Current Qty",
      render: v => (
        <span style={{
          fontWeight: 700,
          color: Number(v) <= 0 ? C.red : Number(v) < 10 ? C.amber : C.green,
        }}>
          {v}
        </span>
      ),
    },
    // {
    //   key: "stock_value", label: "Stock Value",
    //   render: v => <span style={{ fontWeight: 700, color: C.green}}>{fmt(v)}</span>,
    // },
    {
      key: "status", label: "Status", sortable: false,
      render: (_, row) => <StockBadge qty={row.c_qty} />,
    },
  ];

  // ── Stock Movement columns ────────────────────────────────────────────────
  const movementCols = [
    {
      key: "name", label: "Product",
      render: v => <span style={{ fontWeight: 600, color: C.text }}>{v}</span>,
    },
    {
      key: "category", label: "Category",
      render: v => <Badge color={C.blue}>{v || "—"}</Badge>,
    },
    {
      key: "o_qty", label: "Opening",
      render: v => <span style={{ color: C.muted }}>{v ?? 0}</span>,
    },
    {
      key: "purchased", label: "Purchased",
      render: v => (
        <span style={{ color: C.blue, fontWeight: 600 }}>
          {Number(v) > 0 ? `+${v}` : v ?? 0}
        </span>
      ),
    },
    {
      key: "sold", label: "Sold",
      render: v => (
        <span style={{ color: C.red, fontWeight: 600 }}>
          {Number(v) > 0 ? `−${v}` : v ?? 0}
        </span>
      ),
    },
    {
      key: "c_qty", label: "Closing Qty",
      render: v => <span style={{ fontWeight: 600, color: C.text }}>{v}</span>,
    },
  ];

  // ── Low Stock columns ─────────────────────────────────────────────────────
  const lowCols = [
    {
      key: "name", label: "Product",
      render: v => <span style={{ fontWeight: 600, color: C.text }}>{v}</span>,
    },
    {
      key: "category", label: "Category",
      render: v => <Badge color={C.blue}>{v || "—"}</Badge>,
    },
    {
      key: "barcode", label: "Barcode",
      render: v => (
        <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
          {v || "—"}
        </span>
      ),
    },
    {
      key: "c_qty", label: "Current Qty",
      render: v => (
        <span style={{
          fontWeight: 700,
          color: Number(v) <= 0 ? C.red : C.amber,
        }}>
          {v}
        </span>
      ),
    },
    {
      key: "status", label: "Status", sortable: false,
      render: (_, row) => <StockBadge qty={row.c_qty} />,
    },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Inventory Reports"
        sub="Real-time stock tracking and movement analysis."
      />

      {/* Date filter — only relevant for movement tab */}
      <DateFilter
        from={from} to={to} setFrom={setFrom} setTo={setTo}
      />

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 16,
        padding: "4px", background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 10,
        width: "fit-content", boxShadow: "0 1px 4px #00000008",
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "7px 16px", border: "none",
              borderRadius: 7, fontFamily: "inherit",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              transition: "all .15s",
              background: tab === t.key ? C.accent : "transparent",
              color: tab === t.key ? "#fff" : C.muted,
              boxShadow: tab === t.key ? `0 2px 8px ${C.accent}44` : "none",
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.red}33`,
          color: C.red, borderRadius: 10, padding: "10px 16px",
          marginBottom: 14, fontSize: 13, fontWeight: 600,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── CURRENT STOCK TAB ──────────────────────────────────────────────── */}
      {tab === "stock" && (
        <>
          {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner size={28} /></div>}
          {!loading && (
            <DataGrid
              title="Current Stock"
              pageSize={8}
              columns={stockCols}
              data={stockData}
              emptyText="No products found"
              HeaderButtons={[
                { key: "refresh", label: "↺ Refresh", icon: "", variant: "", onClick: loadData },
              ]}
              footerExtra={
                summary && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <StatChip label="Low Stock Items" value={summary.lowCount} color={C.amber} />
                    <StatChip label="Out of Stock" value={summary.outCount} color={C.red} />
                  </div>
                )
              }
            />
          )}
        </>
      )}

      {/* ── STOCK MOVEMENT TAB ────────────────────────────────────────────── */}
      {tab === "movement" && (
        <>
          {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner size={28} /></div>}
          {!loading && (
            <DataGrid
              title="Stock Movement"
              pageSize={8}
              columns={movementCols}
              data={movementData}
              emptyText="No movement data found for the selected period"
              HeaderButtons={[
                { key: "refresh", label: "↺ Refresh", icon: "", variant: "", onClick: loadData },
              ]}
            />
          )}
        </>
      )}

      {/* ── LOW STOCK TAB ─────────────────────────────────────────────────── */}
      {tab === "low" && (
        <>
          {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner size={28} /></div>}
          {!loading && (
            <DataGrid
              title="Low Stock Alert"
              columns={lowCols}
              pageSize={8}
              data={lowData}
              emptyText="✓ All products are well-stocked"
              HeaderButtons={[
                { key: "refresh", label: "↺ Refresh", icon: "", variant: "", onClick: loadData },
              ]}
              footerExtra={
                summary && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <StatChip label="Low Stock Items" value={summary.lowCount} color={C.amber} />
                    <StatChip label="Out of Stock" value={summary.outCount} color={C.red} />
                  </div>
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}