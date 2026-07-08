import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/theme";
import { fmt, fmtDateISO } from "../utils/format";
import { callAPI } from "../utils/callserver";
import {
  Btn, Badge, PageHeader, DateFilter, Spinner, DataGrid, Tabs,
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
function StockBadge({ qty, lowstockqty}) {
  const qty_n = Number(qty) || 0;
  if (qty_n <= 0) return <Badge color={C.red}>Out of Stock</Badge>;
  if (qty_n <= lowstockqty) return <Badge color={C.amber}>Low Stock</Badge>;
  return <Badge color={C.green}>In Stock</Badge>;
}

// ─── stat chip (used in DataGrid footerExtra) ─────────────────────────────────
function StatChip({ label, value, color = C.accent }) {
  return (
    <div className="u-statpill">
      <span className="u-statpill-label">{label}</span>
      <span className="ir-statchip-value" style={{ color }}>
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
      render: v => <span className="u-text u-bold">{v}</span>,
    },
    {
      key: "category", label: "Category",
      render: v => <Badge color={C.blue}>{v || "—"}</Badge>,
    },
    {
      key: "barcode", label: "Barcode",
      render: v => (
        <span className="u-accent u-fs12 u-bold">
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
      render: (_, row) => (
        <span
          className="u-bold-700"
          style={{ color: Number(row.c_qty) <= 0 ? C.red : Number(row.c_qty) <= row.lowstockqty ? C.amber : C.green }}
        >
          {row.c_qty}
        </span>
      ),
    },
    {
      key: "status", label: "Status", sortable: false,
      render: (_, row) => <StockBadge qty={row.c_qty}  lowstockqty={row.lowstockqty}/>,
    },
  ];

  // ── Stock Movement columns ────────────────────────────────────────────────
  const movementCols = [
    {
      key: "name", label: "Product",
      render: v => <span className="u-text u-bold">{v}</span>,
    },
    {
      key: "category", label: "Category",
      render: v => <Badge color={C.blue}>{v || "—"}</Badge>,
    },
    {
      key: "o_qty", label: "Opening",
      render: v => <span className="u-muted">{v ?? 0}</span>,
    },
    {
      key: "purchased", label: "Purchased",
      render: v => (
        <span className="u-blue u-bold">
          {Number(v) > 0 ? `+${v}` : v ?? 0}
        </span>
      ),
    },
    {
      key: "sold", label: "Sold",
      render: v => (
        <span className="u-red u-bold">
          {Number(v) > 0 ? `−${v}` : v ?? 0}
        </span>
      ),
    },
    {
      key: "c_qty", label: "Closing Qty",
      render: v => <span className="u-text u-bold">{v}</span>,
    },
  ];

  // ── Low Stock columns ─────────────────────────────────────────────────────
  const lowCols = [
    {
      key: "name", label: "Product",
      render: v => <span className="u-text u-bold">{v}</span>,
    },
    {
      key: "category", label: "Category",
      render: v => <Badge color={C.blue}>{v || "—"}</Badge>,
    },
    {
      key: "barcode", label: "Barcode",
      render: v => (
        <span className="u-accent u-fs12 u-bold">
          {v || "—"}
        </span>
      ),
    },
    {
      key: "c_qty", label: "Current Qty",
      render: v => (
        <span className="u-bold-700" style={{ color: Number(v) <= 0 ? C.red : C.amber }}>
          {v}
        </span>
      ),
    },
    {
      key: "status", label: "Status", sortable: false,
      render: (_, row) => <StockBadge qty={row.c_qty} lowstockqty={row.lowstockqty} />,
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
      <div className="ar-tabbar">
        <Tabs tabs={TABS} active={tab} onChange={setTab} variant="pill" />
      </div>

      {/* Error banner */}
      {error && (
        <div className="u-alert-error">
          ⚠️ {error}
        </div>
      )}

      {/* ── CURRENT STOCK TAB ──────────────────────────────────────────────── */}
      {tab === "stock" && (
        <>
          {loading && <div className="u-center-pad40"><Spinner size={28} /></div>}
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
                  <div className="ir-summary-chips">
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
          {loading && <div className="u-center-pad40"><Spinner size={28} /></div>}
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
          {loading && <div className="u-center-pad40"><Spinner size={28} /></div>}
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
                  <div className="ir-summary-chips">
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