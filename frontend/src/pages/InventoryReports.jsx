import { useState, useEffect, useRef, useCallback } from "react";
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

  // per-tab totals, fed to the lazy DataGrid so it can render page controls
  const [stockTotal, setStockTotal] = useState(0);
  const [movementTotal, setMovementTotal] = useState(0);
  const [lowTotal, setLowTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Remembers the last { page, pageSize, search } the active DataGrid sent us,
  // so an external change (date range, refresh button) can re-trigger a fetch
  // at the same page size instead of guessing one.
  const loadModelRef = useRef({ page: 1, pageSize: 8 });
  const isFirstRun = useRef(true);

  // ── CURRENT STOCK tab: lazy fetch, called by DataGrid on mount/page/search ─
  const fetchStock = useCallback(async (loadModel) => {
    loadModelRef.current = loadModel;
    setLoading(true);
    setError(null);
    try {
      let url = `reports/inventory/current-stock?page=${loadModel.page}&limit=${loadModel.pageSize}`;
      if (loadModel.search) url += `&search=${loadModel.search}`;
      const data = await callAPI(url, "GET");
      if (loadModel.exportAll) return data?.rows;
      setStockData((data?.rows || []).map((r, i) => ({ ...r, id: r.id ?? i })));
      setSummary(data?.summary || null);
      setStockTotal(data?.pagination?.total ?? 0);
    } catch (e) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── STOCK MOVEMENT tab: lazy fetch (depends on date range) ────────────────
  const fetchMovement = useCallback(async (loadModel) => {
    loadModelRef.current = loadModel;
    setLoading(true);
    setError(null);
    try {
      let url = `reports/inventory/stock-movement?from=${from}&to=${to}&page=${loadModel.page}&limit=${loadModel.pageSize}`;
      if (loadModel.search) url += `&search=${loadModel.search}`;
      const data = await callAPI(url, "GET");
      if (loadModel.exportAll) return data?.rows;
      setMovementData((data?.rows || []).map((r, i) => ({ ...r, id: r.id ?? i })));
      setMovementTotal(data?.pagination?.total ?? 0);
    } catch (e) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // ── LOW STOCK tab: lazy fetch ─────────────────────────────────────────────
  const fetchLow = useCallback(async (loadModel) => {
    loadModelRef.current = loadModel;
    setLoading(true);
    setError(null);
    try {
      let url = `reports/inventory/low-stock?page=${loadModel.page}&limit=${loadModel.pageSize}`;
      if (loadModel.search) url += `&search=${loadModel.search}`;
      const data = await callAPI(url, "GET");
      if (loadModel.exportAll) return data?.rows;
      setLowData((data?.rows || []).map((r, i) => ({ ...r, id: r.id ?? i })));
      setSummary(data?.summary || null);
      setLowTotal(data?.pagination?.total ?? 0);
    } catch (e) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── refetch the ACTIVE tab (back to page 1, same page size) ──────────────
  const refetchActive = useCallback((overrides = {}) => {
    const model = { ...loadModelRef.current, page: 1, ...overrides };
    if (tab === "stock") fetchStock(model);
    else if (tab === "movement") fetchMovement(model);
    else if (tab === "low") fetchLow(model);
  }, [tab, fetchStock, fetchMovement, fetchLow]);

  // ── Stock Movement is date-range driven — re-fetch it when from/to change.
  //    Switching tabs on its own doesn't need this — a freshly-mounted lazy
  //    DataGrid fetches by itself, same as AccountMaster.
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (tab === "movement") fetchMovement({ ...loadModelRef.current, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

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
        <DataGrid
          lazy
          total={stockTotal}
          loading={loading}
          onFetch={fetchStock}
          title="Current Stock"
          pageSize={10}
          columns={stockCols}
          data={stockData}
          emptyText="No products found"
          HeaderButtons={[
            { key: "refresh", label: "↺ Refresh", icon: "", variant: "", onClick: () => refetchActive() },
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

      {/* ── STOCK MOVEMENT TAB ────────────────────────────────────────────── */}
      {tab === "movement" && (
        <DataGrid
          lazy
          total={movementTotal}
          loading={loading}
          onFetch={fetchMovement}
          title="Stock Movement"
          pageSize={10}
          columns={movementCols}
          data={movementData}
          emptyText="No movement data found for the selected period"
          HeaderButtons={[
            { key: "refresh", label: "↺ Refresh", icon: "", variant: "", onClick: () => refetchActive() },
          ]}
        />
      )}

      {/* ── LOW STOCK TAB ─────────────────────────────────────────────────── */}
      {tab === "low" && (
        <DataGrid
          lazy
          total={lowTotal}
          loading={loading}
          onFetch={fetchLow}
          title="Low Stock Alert"
          columns={lowCols}
          pageSize={10}
          data={lowData}
          emptyText="✓ All products are well-stocked"
          HeaderButtons={[
            { key: "refresh", label: "↺ Refresh", icon: "", variant: "", onClick: () => refetchActive() },
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
    </div>
  );
}