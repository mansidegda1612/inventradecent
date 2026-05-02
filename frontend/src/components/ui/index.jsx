
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { C } from "../../utils/theme";

// ─── BUTTON ──────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", small, danger, style: s, disabled, autoFocus }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: small ? "5px 13px" : "8px 18px",
    borderRadius: 9, fontWeight: 600, fontSize: small ? 12 : 13,
    transition: "all .15s", whiteSpace: "nowrap", border: "none",
    opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto",
  };
  const styles = {
    primary: { background: C.accent, color: "#fff", boxShadow: "0 1px 4px " + C.accent + "44" },
    ghost: { background: "transparent", color: C.muted, border: `1.5px solid ${C.border}` },
    danger: { background: C.redBg, color: C.red, border: `1.5px solid ${C.red}33` },
    success: { background: C.greenBg, color: C.green, border: `1.5px solid ${C.green}44` },
  };
  const v = danger ? "danger" : variant;
  return (
    <button
      autoFocus={autoFocus}
      style={{ ...base, ...styles[v], ...s }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.filter = "brightness(.93)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {children}
    </button>
  );
}

// ─── CARD ────────────────────────────────────────────────────────────────────
export function Card({ children, style: s, title, action, noPad }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: "0 1px 6px #00000008", overflow: "hidden", ...s }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
          {action}
        </div>
      )}
      <div style={noPad ? {} : { padding: 20 }}>{children}</div>
    </div>
  );
}

// ─── BADGE ───────────────────────────────────────────────────────────────────
export function Badge({ children, color = C.accent }) {
  return (
    <span style={{
      background: color + "18", color,
      borderRadius: 6, padding: "2px 9px",
      fontSize: 11, fontWeight: 600, letterSpacing: ".04em", whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, color, bg, icon, sub }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 20px", boxShadow: "0 1px 6px #00000008" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: C.hint, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</span>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-.02em", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.hint, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#00000050", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 12px", overflowY: "auto" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, width: "100%", maxWidth: width, boxShadow: "0 20px 60px #00000025", marginTop: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{title}</span>
          <button onClick={onClose} style={{ background: C.bg, border: "none", color: C.muted, fontSize: 18, lineHeight: 1, width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── FIELD ───────────────────────────────────────────────────────────────────
export function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ─── PAGE HEADER ─────────────────────────────────────────────────────────────
export function PageHeader({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, gap: 12, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-.02em" }}>{title}</h1>
        {sub && <p style={{ color: C.muted, marginTop: 3, fontSize: 13 }}>{sub}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ─── DATE FILTER BAR ─────────────────────────────────────────────────────────
// Usage: <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} totalLabel="Filtered Total" totalValue="₹1,23,456" />
export function DateFilter({ from, to, setFrom, setTo, totalLabel, totalValue }) {
  return (
    <div className="date-filter">
      <span className="date-filter-label">📅 Period</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          style={{ borderRadius: 10 }}
        />
        <span className="date-filter-sep">→</span>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          style={{ borderRadius: 10 }}
        />
        <Btn
          small
          variant="ghost"
          onClick={() => {
            const now = new Date();
            setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
            setTo(now.toISOString().slice(0, 10));
          }}
        >
          This Year
        </Btn>
        <Btn
          small
          variant="ghost"
          onClick={() => {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
            setFrom(first); setTo(last);
          }}
        >
          This Month
        </Btn>
      </div>
      {totalValue && (
        <div className="date-filter-total">
          {totalLabel}: {totalValue}
        </div>
      )}
    </div>
  );
}

// ─── TABLE WRAPPER (horizontal scroll on mobile) ──────────────────────────────
export function TableWrap({ children }) {
  return <div className="table-wrap">{children}</div>;
}


//  ─── Tost message ──────────────────────────────
export function ToastProvider({ open, msg, type }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      left: "50%",
      transform: `translateX(-50%) ${open ? "translateY(0)" : "translateY(20px)"}`,
      opacity: open ? 1 : 0,
      transition: "all 0.9s ease",
      zIndex: 2000,
      padding: "10px 16px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      color: type === "error" ? C.redBg : C.greenBg,
      background: type === "error" ? C.red : C.green,
      //border: `1px solid ${type === "error" ? C.red : C.green}`,
      boxShadow: "0 4px 12px #00000020",
      minWidth: 200,
      textAlign: "center"
    }}>
      {msg}
    </div>
  );
}

//  ─── confirmation Box message ──────────────────────────────
export function ConfirmModal({ open, onClose, onConfirm, title = "Confirmtion", message = "Are you sure?" }) {
  return (
    <Modal open={open} onClose={onClose} width={400} title={title}>
      <div>
        <p style={{ fontSize: 13, marginBottom: 20 }}>{message}</p>

        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn danger onClick={onConfirm} autoFocus>
            Confirm
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  DataGrid 
//
//  
//    • Row focus  — click a row or use ↑ / ↓  arrow keys to move focus
//    • focusedRow — the full row object of the currently focused row is passed
//                   to every footer-button onClick as the 3rd argument
//    • Enter key  — toggles checkbox selection on the focused row
//    • Hotkeys    — bind a key combo to any footer button via `hotkey`
//    • Lazy mode  — when `lazy={true}` the parent owns data fetching;
//                   DataGrid calls `onFetch({ page, pageSize, search, sortKey, sortDir })`
//                   on every change and uses `total` prop for pagination maths.
//                   When `lazy={false}` (default) full client-side filter/sort/page.
//
//  ── PROPS ───────────────────────────────────────────────────────────────────
//
//  title          string          header title
//  columns        Column[]        column definitions (see below)
//  data           Row[]           rows — MUST have a unique `id` field on each row
//  pageSize       number          initial rows per page  (default 10)
//  selectable     boolean         show row checkboxes    (default false)
//  footerButtons  FooterBtn[]     action buttons in footer
//  loading        boolean         show shimmer skeleton
//  emptyText      string          custom empty message
//
//  ── LAZY MODE ───────────────────────────────────────────────────────────────
//  lazy           boolean         enable server-side mode  (default false)
//  total          number          total record count returned by API  (lazy only)
//  onFetch        function        called with { page, pageSize, search, sortKey, sortDir }
//                                 whenever any of those change  (lazy only)
//                                 → debounced 300ms on search
//
//  ── COLUMN ──────────────────────────────────────────────────────────────────
//  {
//    key:      string
//    label:    string
//    sortable: boolean                         default true
//    width:    string | number
//    render:   (value, row) => ReactNode
//  }
//
//  ── FOOTER BUTTON ───────────────────────────────────────────────────────────
//  {
//    key:     string
//    label:   string
//    icon:    string                           emoji / text icon
//    variant: "primary" | "danger" | ""
//    hotkey:  string                           e.g. "F2", "ctrl+d", "alt+e"
//             supported modifiers: ctrl, alt, shift  (case-insensitive)
//    onClick: (selectedIds, allData, focusedRow) => void
//                         ↑ selectedIds = checkbox-selected row ids (string[])
//                         ↑ allData     = full data array (lazy: current page data)
//                         ↑ focusedRow  = the currently keyboard/click focused row
//  }
//
//  ── EXAMPLE ─────────────────────────────────────────────────────────────────
//
//  /* CLIENT-SIDE (lazy=false, default) */
//  <DataGrid
//    title="Invoices"
//    columns={cols}
//    data={allInvoices}
//    pageSize={15}
//    selectable
//    footerButtons={[
//      { key: "edit",   label: "Edit",   icon: "✏️", hotkey: "F2",
//        onClick: (ids, all, focused) => openEdit(focused ?? all.find(r => ids[0] === r.id)) },
//      { key: "delete", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d",
//        onClick: (ids) => handleDelete(ids) },
//    ]}
//  />
//
//  /* SERVER-SIDE (lazy=true) */
//  const [rows, setRows]   = useState([]);
//  const [total, setTotal] = useState(0);
//  const [loading, setLoading] = useState(false);
//
//  const handleFetch = async ({ page, pageSize, search, sortKey, sortDir }) => {
//    setLoading(true);
//    const res = await api.getInvoices({ page, pageSize, search, sortKey, sortDir });
//    setRows(res.data);
//    setTotal(res.total);
//    setLoading(false);
//  };
//
//  <DataGrid
//    title="Invoices"
//    columns={cols}
//    data={rows}
//    total={total}
//    loading={loading}
//    lazy
//    onFetch={handleFetch}
//    pageSize={15}
//  />
// ─────────────────────────────────────────────────────────────────────────────

export function DataGrid({
  title,
  columns = [],
  data = [],
  pageSize: initialPageSize = undefined,
  selectable = false,
  footerButtons = [],
  HeaderButtons = [],
  loading = false,
  emptyText = "No records found",
  // lazy mode
  lazy = false,
  total: lazyTotal = 0,
  onFetch,
}) {
  // ── STATE ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => initialPageSize ? initialPageSize : Math.max(5, Math.floor((window.innerHeight - 220) / 45)));
  const [selected, setSelected] = useState(new Set());
  const [visibleKeys, setVisibleKeys] = useState(columns.map(c => c.key));
  const [colDropOpen, setColDropOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(null); // index within pageRows


  const colDropRef = useRef(null);
  const tableRef = useRef(null);
  const searchDebounce = useRef(null);
  // keep latest focusedIdx accessible in global keydown without stale closure
  const focusedIdxRef = useRef(null);
  focusedIdxRef.current = focusedIdx;

  // ── LAZY: fire onFetch on change (debounce search) ─────────────────────────
  const fetchParams = useRef({});
  useEffect(() => {
    if (!lazy) return;
    const params = { page, pageSize, search, sortKey, sortDir };
    fetchParams.current = params;
    if (onFetch) onFetch(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortKey, sortDir]);

  // search debounce for lazy
  useEffect(() => {
    if (!lazy) return;
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      if (onFetch) onFetch({ page: 1, pageSize, search, sortKey, sortDir });
    }, 300);
    return () => clearTimeout(searchDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // reset page on filter change (client mode)
  useEffect(() => {
    if (!lazy) setPage(1);
  }, [search, sortKey, sortDir, pageSize, lazy]);

  // reset focus when page changes
  useEffect(() => { setFocusedIdx(null); }, [page]);

  // ── CLOSE COL DROPDOWN OUTSIDE ─────────────────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (colDropRef.current && !colDropRef.current.contains(e.target))
        setColDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── DATA PIPELINE (client mode only) ──────────────────────────────────────
  const filtered = useMemo(() => {
    if (lazy) return data;
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(row =>
      Object.values(row).some(v => String(v ?? "").toLowerCase().includes(q))
    );
  }, [data, search, lazy]);

  const sorted = useMemo(() => {
    if (lazy || !sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
  }, [filtered, sortKey, sortDir, lazy]);

  const total = lazy ? lazyTotal : sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = lazy ? data : sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleCols = columns.filter(c => visibleKeys.includes(c.key));
  const from = Math.min((safePage - 1) * pageSize + 1, total);
  const to = Math.min(safePage * pageSize, total);

  // ── FOCUSED ROW OBJECT ─────────────────────────────────────────────────────
  const focusedRow = focusedIdx !== null ? pageRows[focusedIdx] ?? null : null;

  // ── SELECTION ──────────────────────────────────────────────────────────────
  const allPageSelected =
    pageRows.length > 0 && pageRows.every(r => selected.has(r.id));

  const toggleAll = () => {
    const next = new Set(selected);
    pageRows.forEach(r => (allPageSelected ? next.delete(r.id) : next.add(r.id)));
    setSelected(next);
  };

  const toggleRow = id => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // ── SORT ───────────────────────────────────────────────────────────────────
  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // ── COLUMN TOGGLE ──────────────────────────────────────────────────────────
  const toggleCol = key => {
    setVisibleKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // ── PAGINATION PAGE NUMBERS ────────────────────────────────────────────────
  const pageNums = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= safePage - 1 && i <= safePage + 1))
      pageNums.push(i);
    else if (pageNums[pageNums.length - 1] !== "…")
      pageNums.push("…");
  }

  // ── SCROLL FOCUSED ROW INTO VIEW ───────────────────────────────────────────
  useEffect(() => {
    if (focusedIdx === null || !tableRef.current) return;
    const rows = tableRef.current.querySelectorAll("tbody tr[data-idx]");
    rows[focusedIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx]);

  // ── HOTKEY PARSER ──────────────────────────────────────────────────────────
  // Parses "ctrl+d", "alt+F2", "F2", "shift+enter" → { ctrl, alt, shift, key }
  const parseHotkey = raw => {
    const parts = raw.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    return {
      ctrl: parts.includes("ctrl"),
      alt: parts.includes("alt"),
      shift: parts.includes("shift"),
      key,
    };
  };

  // ── GLOBAL KEYBOARD HANDLER ────────────────────────────────────────────────
  const handleKeyDown = useCallback(e => {
    const tag = e.target?.tagName?.toLowerCase();
    const inInput = tag === "input" || tag === "textarea" || tag === "select";

    // ── Arrow navigation (works even in inputs for ↑↓) ──────────────────────
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // only when focus is inside our grid wrapper
      if (!tableRef.current?.closest("[data-dg-root]")?.contains(document.activeElement) &&
        !tableRef.current?.contains(document.activeElement)) return;

      e.preventDefault();
      const len = pageRows.length;
      if (!len) return;
      setFocusedIdx(prev => {
        if (prev === null) return e.key === "ArrowDown" ? 0 : len - 1;
        return e.key === "ArrowDown"
          ? Math.min(prev + 1, len - 1)
          : Math.max(prev - 1, 0);
      });
      // move DOM focus to the table so subsequent arrows keep working
      tableRef.current?.querySelector("tbody tr[data-idx]")?.focus();
      return;
    }

    // ── Enter = toggle checkbox on focused row ────────────────────────────
    if (e.key === "Enter" && selectable && !inInput ) {
      const idx = focusedIdxRef.current;
      if (idx !== null && pageRows[idx]) {
        e.preventDefault();
        toggleRow(pageRows[idx].id);
      }
      return;
    }

    // ── Hotkeys for footer buttons ─────────────────────────────────────────
    if (inInput && !e.ctrlKey && !e.altKey) return; // ignore plain keys in inputs
    const btns = [...footerButtons, ...HeaderButtons];
    for (const btn of btns) {
      if (!btn.hotkey) continue;
      const hk = parseHotkey(btn.hotkey);
      const keyMatch = e.key.toLowerCase() === hk.key || e.code.toLowerCase() === hk.key;
      if (
        keyMatch &&
        !!e.ctrlKey === hk.ctrl &&
        !!e.altKey === hk.alt &&
        !!e.shiftKey === hk.shift
      ) {
        e.preventDefault();
        const idx = focusedIdxRef.current;
        const fr = idx !== null ? pageRows[idx] ?? null : null;
        btn.onClick?.(Array.from(selected), data, fr);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, selected, footerButtons, data]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── INJECT SHIMMER KEYFRAMES ───────────────────────────────────────────────
  if (typeof document !== "undefined" && !document.getElementById("dg-shimmer-style")) {
    const s = document.createElement("style");
    s.id = "dg-shimmer-style";
    s.textContent = `
      @keyframes dg-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      tr[data-idx]:focus { outline: none; }
    `;
    document.head.appendChild(s);
  }

  // ── STYLES ─────────────────────────────────────────────────────────────────
  const S = {
    wrap: {
      background: C.card, borderRadius: 16,
      border: `1px solid ${C.border}`,
      boxShadow: "0 2px 12px #00000009", overflow: "hidden",
    },
    toolbar: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 18px", borderBottom: `1px solid ${C.border}`,
      gap: 10, flexWrap: "wrap", background: "#fafbfd",
    },
    titleText: { fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: "-.01em" },
    toolbarRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
    searchWrap: { position: "relative", display: "flex", alignItems: "center" },
    searchIcon: { position: "absolute", left: 10, fontSize: 13, color: C.muted, pointerEvents: "none" },
    searchInput: {
      height: 33, padding: "0 10px 0 30px",
      border: `1.5px solid ${C.border}`, borderRadius: 9,
      fontSize: 12.5, fontFamily: "inherit",
      background: C.card, color: C.text, outline: "none", width: 210,
      transition: "border .15s, box-shadow .15s",
    },
    colBtn: {
      height: 33, padding: "0 12px", borderRadius: 9,
      border: `1.5px solid ${C.border}`, background: C.card,
      fontSize: 12, fontWeight: 600, color: C.sub, cursor: "pointer",
      display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
      transition: "all .15s",
    },
    colDropdown: {
      position: "absolute", right: 0, top: "calc(100% + 6px)",
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, boxShadow: "0 8px 30px #00000014",
      padding: 8, zIndex: 200, minWidth: 170,
    },
    colItem: {
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 10px", borderRadius: 8, cursor: "pointer",
      fontSize: 12.5, color: C.sub, transition: "background .1s",
      userSelect: "none",
    },
    selBar: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 18px", background: C.accent + "12",
      borderBottom: `1px solid ${C.accent}33`,
      fontSize: 12.5, fontWeight: 600, color: C.accent, flexWrap: "wrap",
    },
    tableWrap: { overflowX: "auto" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 },
    thead: { background: "#f7f8fb", borderBottom: `2px solid ${C.border}` },
    th: sortable => ({
      padding: "11px 14px", textAlign: "left",
      fontSize: 11, fontWeight: 700, color: C.muted,
      textTransform: "uppercase", letterSpacing: ".07em",
      whiteSpace: "nowrap", userSelect: "none",
      cursor: sortable ? "pointer" : "default",
      transition: "color .1s, background .1s",
    }),
    thCheck: { padding: "11px 14px", width: 38, textAlign: "center" },
    td: {
      padding: "11px 14px", color: C.text, fontSize: 13,
      borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
      verticalAlign: "middle",
    },
    tdCheck: {
      padding: "11px 14px", width: 38, textAlign: "center",
      borderBottom: `1px solid ${C.border}`, verticalAlign: "middle",
    },
    emptyWrap: { textAlign: "center", padding: "50px 20px", color: C.hint, fontSize: 13 },
    footer: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "11px 18px", borderTop: `1px solid ${C.border}`,
      gap: 10, flexWrap: "wrap", background: "#fafbfd",
    },
    footerLeft: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    footerRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    pageSizeRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted },
    pageSizeSelect: {
      height: 28, padding: "0 8px", borderRadius: 7,
      border: `1.5px solid ${C.border}`, fontSize: 12,
      fontFamily: "inherit", color: C.sub, background: C.card, cursor: "pointer", outline: "none",
    },
    footerInfo: { fontSize: 12, color: C.muted, fontWeight: 500 },
    pagination: { display: "flex", alignItems: "center", gap: 4 },
    pageBtn: (active, disabled) => ({
      minWidth: 30, height: 30, padding: "0 6px", borderRadius: 8,
      border: `1.5px solid ${active ? C.accent : C.border}`,
      background: active ? C.accent : C.card,
      fontSize: 12, fontWeight: 600,
      color: active ? "#fff" : C.sub,
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all .13s", fontFamily: "inherit",
      opacity: disabled ? 0.38 : 1,
      boxShadow: active ? `0 2px 8px ${C.accent}44` : "none",
    }),
    actionBtn: variant => ({
      height: 30, padding: "0 12px", borderRadius: 8,
      border: variant === "danger"
        ? `1.5px solid ${C.red}33`
        : variant === "primary"
          ? `1.5px solid ${C.accent}`
          : `1.5px solid ${C.border}`,
      background:
        variant === "danger" ? C.redBg :
          variant === "primary" ? C.accent : C.card,
      fontSize: 12, fontWeight: 600,
      color:
        variant === "danger" ? C.red :
          variant === "primary" ? "#fff" : C.sub,
      cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "inherit", transition: "filter .13s",
      whiteSpace: "nowrap",
    }),
    footerActions: { display: "flex", alignItems: "center", gap: 7 },
    hotkeyBadge: {
      display: "inline-flex", alignItems: "center",
      background: "#00000015", borderRadius: 4,
      padding: "1px 5px", fontSize: 10, fontWeight: 700,
      letterSpacing: ".04em", marginLeft: 5,
      fontFamily: "monospace",
    },
    skeleton: {
      background: "linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)",
      backgroundSize: "200% 100%",
      animation: "dg-shimmer 1.3s infinite",
      borderRadius: 6, height: 13,
    },
  };

  // ── ROW BACKGROUND LOGIC ───────────────────────────────────────────────────
  const rowBg = (isSelected, isFocused) => {
    if (isFocused && isSelected) return C.accent + "22";
    if (isFocused) return C.accent + "14";
    if (isSelected) return C.accent + "0e";
    return "transparent";
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap} data-dg-root="1">

      {/* ── TOOLBAR ── */}
      <div style={S.toolbar}>
        {title && <span style={S.titleText}>{title}</span>}
        <div style={S.toolbarRight}>

          {/* Search */}
          <div style={S.searchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input
              style={S.searchInput}
              placeholder="Search anything…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={e => {
                e.target.style.borderColor = C.accent;
                e.target.style.boxShadow = `0 0 0 3px ${C.accent}18`;
              }}
              onBlur={e => {
                e.target.style.borderColor = C.border;
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Column visibility */}
          <div style={{ position: "relative" }} ref={colDropRef}>
            <button
              style={S.colBtn}
              onClick={() => setColDropOpen(o => !o)}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = C.accent;
                e.currentTarget.style.color = C.accent;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.color = C.sub;
              }}
            >
              ⊞ Columns
            </button>
            {colDropOpen && (
              <div style={S.colDropdown}>
                {columns.map(c => (
                  <label
                    key={c.key}
                    style={S.colItem}
                    onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <input
                      type="checkbox"
                      checked={visibleKeys.includes(c.key)}
                      onChange={() => toggleCol(c.key)}
                      style={{ accentColor: C.accent, width: 14, height: 14 }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={S.toolbarRight}>
          {/* Header buttons */}
          {HeaderButtons.length > 0 && (
            <div style={S.footerActions}>
              {HeaderButtons.map(btn => (
                <button
                  key={btn.key}
                  style={S.actionBtn(btn.variant || "")}
                  onClick={() => btn.onClick?.(Array.from(selected), data, focusedRow)}
                  onMouseEnter={e => (e.currentTarget.style.filter = "brightness(.93)")}
                  onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
                  title={btn.hotkey ? `Shortcut: ${btn.hotkey}` : undefined}
                >
                  {btn.icon && <span>{btn.icon}</span>}
                  {btn.label}

                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SELECTION + FOCUS BANNER ── */}
      {(selected.size > 0) && (
        <div style={S.selBar}>
          {selected.size > 0 && (
            <>
              ✓&nbsp;<strong>{selected.size}</strong>&nbsp;row{selected.size !== 1 ? "s" : ""} selected
              <button
                style={{ ...S.actionBtn("danger"), height: 24, padding: "0 10px", fontSize: 11 }}
                onClick={() => setSelected(new Set())}
              >
                ✕ Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* ── TABLE ── */}
      <div style={S.tableWrap}>
        <table style={S.table} ref={tableRef}>
          <thead>
            <tr style={S.thead}>
              {selectable && (
                <th style={S.thCheck}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAll}
                    style={{ accentColor: C.accent, width: 14, height: 14, cursor: "pointer" }}
                  />
                </th>
              )}
              {visibleCols.map(c => {
                const sortable = c.sortable !== false;
                const isActive = sortKey === c.key;
                const icon = isActive ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";
                return (
                  <th
                    key={c.key}
                    style={{
                      ...S.th(sortable),
                      ...(c.width ? { width: c.width } : {}),
                    }}
                    onClick={() => sortable && handleSort(c.key)}
                    onMouseEnter={e => sortable && (
                      e.currentTarget.style.color = C.accent,
                      e.currentTarget.style.background = C.accent + "10"
                    )}
                    onMouseLeave={e => (
                      e.currentTarget.style.color = C.muted,
                      e.currentTarget.style.background = "transparent"
                    )}
                  >
                    {c.label}
                    {sortable && (
                      <span style={{
                        fontSize: 10, marginLeft: 3,
                        opacity: isActive ? 1 : 0.4,
                        color: isActive ? C.accent : "inherit",
                      }}>
                        {icon}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading
              ? /* ── SKELETON ── */
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i}>
                  {selectable && (
                    <td style={S.tdCheck}>
                      <div style={{ ...S.skeleton, width: 14, height: 14, borderRadius: 3 }} />
                    </td>
                  )}
                  {visibleCols.map(c => (
                    <td key={c.key} style={S.td}>
                      <div style={{ ...S.skeleton, width: `${45 + (i * 7 + c.key.length * 5) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))

              : pageRows.length === 0
                ? /* ── EMPTY ── */
                <tr>
                  <td colSpan={visibleCols.length + (selectable ? 1 : 0)}>
                    <div style={S.emptyWrap}>
                      <div style={{ fontSize: 32, marginBottom: 10, opacity: .45 }}>📭</div>
                      {emptyText}
                    </div>
                  </td>
                </tr>

                : /* ── DATA ROWS ── */
                pageRows.map((row, ri) => {
                  const isSelected = selected.has(row.id);
                  const isFocused = focusedIdx === ri;
                  return (
                    <tr
                      key={row.id ?? ri}
                      data-idx={ri}
                      tabIndex={-1}
                      style={{
                        background: rowBg(isSelected, isFocused),
                        transition: "background .1s",
                        outline: isFocused ? `2px solid ${C.accent}` : "none",
                        outlineOffset: "-2px",
                        cursor: "pointer",
                      }}
                      onClick={() => setFocusedIdx(ri)}
                      onMouseEnter={e => {
                        if (!isSelected && !isFocused)
                          e.currentTarget.style.background = "#f7f8fd";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected && !isFocused)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {selectable && (
                        <td style={S.tdCheck}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ accentColor: C.accent, width: 14, height: 14, cursor: "pointer" }}
                          />
                        </td>
                      )}
                      {visibleCols.map(c => (
                        <td key={c.key} style={S.td}>
                          {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* ── FOOTER ── */}
      <div style={S.footer}>
        <div style={S.footerLeft}>

          {/* Footer buttons */}
          {footerButtons.length > 0 && (
            <div style={S.footerActions}>
              {footerButtons.map(btn => (
                <button
                  key={btn.key}
                  style={S.actionBtn(btn.variant || "")}
                  onClick={() => btn.onClick?.(Array.from(selected), data, focusedRow)}
                  onMouseEnter={e => (e.currentTarget.style.filter = "brightness(.93)")}
                  onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
                  title={btn.hotkey ? `Shortcut: ${btn.hotkey}` : undefined}
                >
                  {btn.icon && <span>{btn.icon}</span>}
                  {btn.label}

                </button>
              ))}
            </div>
          )}
        </div>
        <div style={S.footerRight}>

          {/* Record count */}
          <span style={S.footerInfo}>
            {total === 0
              ? "No records"
              : <>{from}–{to} of <strong style={{ color: C.sub }}>{total}</strong> records</>
            }
          </span>
          {/* Pagination */}
          <div style={S.pagination}>
            <button
              style={S.pageBtn(false, safePage === 1)}
              disabled={safePage === 1}
              onClick={() => setPage(p => p - 1)}
            >‹</button>

            {pageNums.map((p, i) =>
              p === "…"
                ? <span key={`e${i}`} style={{ padding: "0 4px", color: C.hint }}>…</span>
                : (
                  <button
                    key={p}
                    style={S.pageBtn(p === safePage, false)}
                    onClick={() => setPage(p)}
                    onMouseEnter={e => p !== safePage && (
                      e.currentTarget.style.borderColor = C.accent,
                      e.currentTarget.style.color = C.accent,
                      e.currentTarget.style.background = C.accent + "12"
                    )}
                    onMouseLeave={e => p !== safePage && (
                      e.currentTarget.style.borderColor = C.border,
                      e.currentTarget.style.color = C.sub,
                      e.currentTarget.style.background = C.card
                    )}
                  >
                    {p}
                  </button>
                )
            )}

            <button
              style={S.pageBtn(false, safePage === totalPages)}
              disabled={safePage === totalPages}
              onClick={() => setPage(p => p + 1)}
            >›</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
//  Extra Components — same style/theme as index.jsx
//  Import C from your theme: import { C } from "../../utils/theme";
// ─────────────────────────────────────────────────────────────────────────────
//
//  COMPONENTS
//  ───────────────────────────────────────────────────────────────────────────
//  1. Dropdown         — searchable, keyboard-navigable, dynamic data
//  2. MultiDropdown    — same as Dropdown but multi-select with chips
//  3. Tabs             — horizontal tab switcher
//  4. Stepper          — progress stepper (e.g. wizard forms)
//  5. EmptyState       — consistent "no data" / "not found" placeholder
//  6. Spinner          — inline or overlay loading spinner
//  7. SectionDivider   — labelled horizontal divider
//  8. KVTable          — key → value rows (for detail panels / summaries)
// ─────────────────────────────────────────────────────────────────────────────

// ─── inject shared keyframes once ────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("xc-shared-style")) {
  const s = document.createElement("style");
  s.id = "xc-shared-style";
  s.textContent = `
    @keyframes xc-spin   { to { transform: rotate(360deg); } }
    @keyframes xc-fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DROPDOWN
//
//  Props
//  ─────
//  options       { value, label, icon?, sub?, disabled? }[]   required
//  value         any                         controlled value
//  onChange      (value, option) => void     fired on selection
//  placeholder   string                      default "Select…"
//  label         string                      floats above the trigger
//  disabled      boolean
//  clearable     boolean                     show ✕ to clear
//  width         string | number             CSS width (default "100%")
//  footerButtons { label, icon, onClick }[]  action buttons inside dropdown footer
//
//  Keyboard
//  ────────
//  ↑ / ↓     navigate options
//  Enter      confirm focused option
//  Escape     close
//  Any char   filters list (search)
// ─────────────────────────────────────────────────────────────────────────────
export function Dropdown({
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  label,
  disabled = false,
  clearable = false,
  width = "100%",
  footerButtons = [],
  keyField = "id",
  displayField = "name"
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focIdx, setFocIdx] = useState(-1);
  const [isShiftTab, SetIsShiftTab] = useState(false);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const clickTimer = useRef(null);

  const selected = options.find(o => o[keyField] == value) ?? null;

  const filtered = search
    ? options.filter(o =>
      (o[displayField] + " " + (o.sub ?? "")).toLowerCase().includes(search.toLowerCase())
    )
    : options;

  // close on outside click
  useEffect(() => {
    const h = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
        setFocIdx(-1);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  //list click focus and double click setvalue
  const handleItemClick = useCallback((opt, i) => {
    if (opt.disabled) return;

    // if (clickTimer.current) {
    //   // second click within 250ms → double-click → SELECT
    //   clearTimeout(clickTimer.current);
    //   clickTimer.current = null;
      onChange?.(opt[keyField], opt);
      setOpen(false);
      setSearch("");
    // } else {
    //   // first click → FOCUS only, wait to confirm it's not a double-click
    //   setFocIdx(i);
    //   clickTimer.current = setTimeout(() => {
    //     clickTimer.current = null;
    //   }, 250);
    // }
  });

  // auto-focus search when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
      const idx = filtered.findIndex(o => o[keyField] == value);
      setFocIdx(idx >= 0 ? idx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // scroll focused item into view
  useEffect(() => {
    if (!listRef.current || focIdx < 0) return;
    const items = listRef.current.querySelectorAll("[data-xc-item]");
    items[focIdx]?.scrollIntoView({ block: "nearest" });
  }, [focIdx]);

  const handleKeyDown = useCallback(e => {

    if (e.key === "ArrowDown") { e.preventDefault(); setFocIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      setValue();
    }
    else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false); setSearch(""); setFocIdx(-1);
      if (e.key === "Tab" && e.shiftKey) SetIsShiftTab(true); // ← add this
    }


    for (const btn of footerButtons) {
      if (!btn.hotkey) continue;
      const needCtrl = btn.hotkey.startsWith("ctrl+");
      const bareKey = needCtrl ? btn.hotkey.replace("ctrl+", "") : btn.hotkey;
      const matchMod = needCtrl ? (e.ctrlKey || e.metaKey) : true;
      if (matchMod && e.key.toLowerCase() === bareKey.toLowerCase()) {
        e.preventDefault();
        fireBtnAction(btn);
        return;
      }
    }
  }, [open, filtered, focIdx, onChange]);

  const fireBtnAction = useCallback((btn) => {
    const focused = filtered[focIdx] ?? null;
    btn.onClick?.(focIdx, focused);   // caller receives (index, option)
  }, [filtered, focIdx]);

  const setValue = () => {
    const opt = filtered[focIdx];
    if (opt && !opt.disabled) {
      onChange?.(opt[keyField], opt);
      setOpen(false);
      setSearch("");
    }
  }
  const S = {
    wrap: { position: "relative", width },
    lbl: { display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 },
    trigger: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      height: 38, padding: "0 12px",
      border: `1.5px solid ${open ? C.accent : C.border}`,
      borderRadius: 10, background: disabled ? C.bg : C.card,
      cursor: disabled ? "not-allowed" : "pointer", fontSize: 13,
      color: selected ? C.text : C.hint, fontFamily: "inherit",
      boxShadow: open ? `0 0 0 3px ${C.accent}18` : "none",
      transition: "border .15s, box-shadow .15s",
      userSelect: "none", gap: 8,
      opacity: disabled ? 0.6 : 1,
    },
    dropdown: {
      position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, boxShadow: "0 8px 30px #00000018",
      zIndex: 500, overflow: "hidden",
      animation: "xc-fadeIn .13s ease",
    },
    searchWrap: {
      padding: "10px 10px 8px", borderBottom: `1px solid ${C.border}`,
      position: "relative", display: "flex", alignItems: "center",
    },
    searchIcon: { position: "absolute", left: 20, fontSize: 12, color: C.hint, pointerEvents: "none" },
    searchInput: {
      width: "100%", height: 30, padding: "0 8px 0 26px",
      border: `1.5px solid ${C.border}`, borderRadius: 8,
      fontSize: 12.5, fontFamily: "inherit",
      background: C.bg, color: C.text, outline: "none",
      transition: "border .15s",
    },
    list: { maxHeight: 170, overflowY: "auto", padding: "6px" },
    item: (isFoc, isSel, isDis) => ({
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", borderRadius: 8, cursor: isDis ? "not-allowed" : "pointer",
      background: isFoc ? C.accent + "14" : isSel ? C.accent + "0d" : "transparent",
      opacity: isDis ? 0.45 : 1,
      transition: "background .1s",
    }),
    itemLabel: isSel => ({ fontSize: 13, color: C.text, fontWeight: isSel ? 600 : 400 }),
    itemSub: { fontSize: 11, color: C.hint, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    noMatch: { padding: "20px 10px", textAlign: "center", fontSize: 12, color: C.hint },
    footer: { borderTop: `1px solid ${C.border}`, padding: "8px 10px", display: "flex", gap: 6, flexWrap: "wrap" },
    footBtn: {
      flex: 1, height: 28, borderRadius: 8,
      border: `1.5px solid ${C.border}`, background: C.bg,
      fontSize: 11.5, fontWeight: 600, color: C.sub,
      cursor: "pointer", fontFamily: "inherit",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      transition: "all .13s",
    },
    caret: { fontSize: 10, color: C.hint, transition: "transform .15s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 },
    clearBtn: { background: "none", border: "none", cursor: "pointer", color: C.hint, fontSize: 14, lineHeight: 1, padding: 0, display: "flex", alignItems: "center" },
  };

  return (
    <div style={S.wrap} ref={wrapRef} onKeyDown={handleKeyDown}>
      {/* {label && <label style={S.lbl}>{label}</label>} */}

      <div style={S.trigger} tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled} role="combobox" aria-expanded={open}
        onFocus={() => {
          if (isShiftTab) { SetIsShiftTab(false); return; } 
          !disabled && setOpen(true);
        }}>

        <span style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0, overflow: "hidden" }}>
          {selected?.icon && <span style={{ fontSize: 14 }}>{selected.icon}</span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? selected[displayField] : placeholder}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {clearable && selected && (
            <button style={S.clearBtn} onClick={e => { e.stopPropagation(); onChange?.(null, null); }}>✕</button>
          )}
          <span style={S.caret}>▾</span>
        </span>
      </div>

      {open && (
        <div style={S.dropdown}>
          {/* Search */}
          <div style={S.searchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input
              tabIndex={-1}
              ref={searchRef}
              style={S.searchInput}
              placeholder="Search…"
              value={search}
              onChange={e => { setSearch(e.target.value); setFocIdx(0); }}
              // onKeyDown={handleKeyDown}
              onFocus={e => { e.target.style.borderColor = C.accent; }}
              onBlur={e => { e.target.style.borderColor = C.border; }}
            />
          </div>

          {/* List */}
          <div style={S.list} ref={listRef}>
            {filtered.length === 0
              ? <div style={S.noMatch}>📭 No matches</div>
              : filtered.map((opt, i) => {
                const isFoc = i === focIdx;
                const isSel = opt[keyField] == value;
                return (
                  <div
                    key={opt[keyField]}
                    // onKeyDown={handleKeyDown}
                    data-xc-item
                    style={S.item(isFoc, isSel, opt.disabled)}
                    onClick={() => handleItemClick(opt, i)}
                  >
                    {opt.icon && <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: "center" }}>{opt.icon}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.itemLabel(isSel)}>{opt[displayField]}</div>
                      {opt.sub && <div style={S.itemSub}>{opt.sub}</div>}
                    </div>
                    {isSel && <span style={{ fontSize: 14, color: C.accent, flexShrink: 0 }}>✓</span>}
                  </div>
                );
              })
            }
          </div>

          {/* Footer buttons */}
          {footerButtons.length > 0 && (
            <div style={S.footer}>
              {footerButtons.map((btn, i) => (
                <button
                  key={i}
                  tabIndex={-1}
                  style={S.footBtn}
                  onClick={() => fireBtnAction(btn)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.sub; }}
                >
                  {btn.icon && <span>{btn.icon}</span>}
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. MULTI-DROPDOWN
//
//  Same keyboard UX as Dropdown but allows multiple selections.
//  Selected items render as removable chips inside the trigger.
//
//  Props
//  ─────
//  options       { value, label, icon?, sub?, disabled? }[]
//  value         any[]                        array of selected values
//  onChange      (values, options) => void
//  placeholder   string
//  label         string
//  disabled      boolean
//  maxVisible    number                        max chips shown before "+N more" (default 3)
//  width         string | number
//  footerButtons { label, icon, onClick }[]
// ─────────────────────────────────────────────────────────────────────────────
export function MultiDropdown({
  options = [],
  value = [],
  onChange,
  placeholder = "Select…",
  label,
  disabled = false,
  maxVisible = 3,
  width = "100%",
  footerButtons = [],
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focIdx, setFocIdx] = useState(0);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const selectedOpts = options.filter(o => value.includes(o.value));
  const filtered = search
    ? options.filter(o => (o.label + " " + (o.sub ?? "")).toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const h = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setSearch(""); setFocIdx(0);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!listRef.current || focIdx < 0) return;
    const items = listRef.current.querySelectorAll("[data-xc-item]");
    items[focIdx]?.scrollIntoView({ block: "nearest" });
  }, [focIdx]);

  const toggle = opt => {
    if (opt.disabled) return;
    const next = value.includes(opt.value)
      ? value.filter(v => v !== opt.value)
      : [...value, opt.value];
    onChange?.(next, options.filter(o => next.includes(o.value)));
  };

  const handleKeyDown = useCallback(e => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const opt = filtered[focIdx]; if (opt) toggle(opt); }
    else if (e.key === "Escape") { setOpen(false); setSearch(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, focIdx, value]);

  const visibleChips = selectedOpts.slice(0, maxVisible);
  const extra = selectedOpts.length - maxVisible;

  const S = {
    wrap: { position: "relative", width },
    lbl: { display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 },
    trigger: {
      display: "flex", alignItems: "center", flexWrap: "wrap",
      minHeight: 38, padding: "4px 10px",
      border: `1.5px solid ${open ? C.accent : C.border}`,
      borderRadius: 10, background: disabled ? C.bg : C.card,
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: open ? `0 0 0 3px ${C.accent}18` : "none",
      gap: 5, opacity: disabled ? 0.6 : 1,
      transition: "border .15s, box-shadow .15s",
    },
    chip: {
      display: "inline-flex", alignItems: "center", gap: 4,
      background: C.accent + "18", color: C.accent,
      borderRadius: 6, padding: "2px 7px 2px 8px",
      fontSize: 11.5, fontWeight: 600,
    },
    chipRemove: { background: "none", border: "none", cursor: "pointer", color: C.accent, fontSize: 12, padding: 0, lineHeight: 1, display: "flex", alignItems: "center" },
    extra: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 600, color: C.hint },
    caret: { marginLeft: "auto", fontSize: 10, color: C.hint, transition: "transform .15s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 },
    dropdown: { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px #00000018", zIndex: 500, overflow: "hidden", animation: "xc-fadeIn .13s ease" },
    searchWrap: { padding: "10px 10px 8px", borderBottom: `1px solid ${C.border}`, position: "relative", display: "flex", alignItems: "center" },
    searchIcon: { position: "absolute", left: 20, fontSize: 12, color: C.hint, pointerEvents: "none" },
    searchInput: { width: "100%", height: 30, padding: "0 8px 0 26px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none" },
    list: { maxHeight: 224, overflowY: "auto", padding: "6px" },
    item: (isFoc, isDis) => ({ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: isDis ? "not-allowed" : "pointer", background: isFoc ? C.accent + "14" : "transparent", opacity: isDis ? 0.45 : 1, transition: "background .1s" }),
    check: { width: 16, height: 16, borderRadius: 4, border: `2px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", transition: "all .1s" },
    checkOn: { width: 16, height: 16, borderRadius: 4, border: `2px solid ${C.accent}`, background: C.accent, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
    footer: { borderTop: `1px solid ${C.border}`, padding: "8px 10px", display: "flex", gap: 6, flexWrap: "wrap" },
    footBtn: { flex: 1, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 11.5, fontWeight: 600, color: C.sub, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all .13s" },
    clearAllBtn: { height: 28, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.red}33`, background: C.redBg, fontSize: 11, fontWeight: 600, color: C.red, cursor: "pointer", fontFamily: "inherit" },
    doneBtn: { height: 28, padding: "0 12px", borderRadius: 8, border: `1.5px solid ${C.accent}44`, background: C.accent + "0d", fontSize: 11.5, fontWeight: 600, color: C.accent, cursor: "pointer", fontFamily: "inherit" },
  };

  return (
    <div style={S.wrap} ref={wrapRef} onKeyDown={handleKeyDown} tabIndex={disabled ? -1 : 0}>
      {label && <label style={S.lbl}>{label}</label>}

      <div style={S.trigger} onClick={() => !disabled && setOpen(o => !o)}>
        {selectedOpts.length === 0
          ? <span style={{ fontSize: 13, color: C.hint, flex: 1 }}>{placeholder}</span>
          : <>
            {visibleChips.map(o => (
              <span key={o.value} style={S.chip}>
                {o.icon && <span>{o.icon}</span>}
                {o.label}
                <button style={S.chipRemove} onClick={e => { e.stopPropagation(); toggle(o); }}>✕</button>
              </span>
            ))}
            {extra > 0 && <span style={S.extra}>+{extra} more</span>}
          </>
        }
        <span style={S.caret}>▾</span>
      </div>

      {open && (
        <div style={S.dropdown}>
          <div style={S.searchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input
              ref={searchRef}
              style={S.searchInput}
              placeholder="Search…"
              value={search}
              onChange={e => { setSearch(e.target.value); setFocIdx(0); }}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div style={S.list} ref={listRef}>
            {filtered.length === 0
              ? <div style={{ padding: "18px 10px", textAlign: "center", fontSize: 12, color: C.hint }}>📭 No matches</div>
              : filtered.map((opt, i) => {
                const isSel = value.includes(opt.value);
                const isFoc = i === focIdx;
                return (
                  <div key={opt.value} data-xc-item style={S.item(isFoc, opt.disabled)} onClick={() => toggle(opt)} onMouseEnter={() => setFocIdx(i)}>
                    <div style={isSel ? S.checkOn : S.check}>
                      {isSel && <span style={{ fontSize: 10, color: "#fff", fontWeight: 800 }}>✓</span>}
                    </div>
                    {opt.icon && <span style={{ fontSize: 14 }}>{opt.icon}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: isSel ? 600 : 400 }}>{opt.label}</div>
                      {opt.sub && <div style={{ fontSize: 11, color: C.hint, marginTop: 1 }}>{opt.sub}</div>}
                    </div>
                  </div>
                );
              })
            }
          </div>

          <div style={S.footer}>
            {selectedOpts.length > 0 && (
              <button style={S.clearAllBtn} onClick={() => onChange?.([], [])}>✕ Clear all</button>
            )}
            {footerButtons.map((btn, i) => (
              <button key={i} style={S.footBtn}
                onClick={() => { btn.onClick?.(); setOpen(false); }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.sub; }}
              >
                {btn.icon && <span>{btn.icon}</span>}
                {btn.label}
              </button>
            ))}
            <button style={S.doneBtn} onClick={() => setOpen(false)}>✓ Done</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. TABS
//
//  Props
//  ─────
//  tabs      { key, label, icon?, badge? }[]
//  active    string                           controlled active key
//  onChange  (key) => void
//  variant   "underline" | "pill"             default "underline"
// ─────────────────────────────────────────────────────────────────────────────
export function Tabs({ tabs = [], active, onChange, variant = "underline" }) {
  return (
    <div style={{
      display: "flex", gap: variant === "pill" ? 4 : 0,
      borderBottom: variant === "underline" ? `2px solid ${C.border}` : "none",
      background: variant === "pill" ? C.bg : "transparent",
      borderRadius: variant === "pill" ? 10 : 0,
      padding: variant === "pill" ? 4 : 0,
      flexWrap: "wrap",
    }}>
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange?.(tab.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: variant === "pill" ? "6px 14px" : "10px 16px",
              fontSize: 13, fontWeight: isActive ? 700 : 500,
              cursor: "pointer", border: "none", fontFamily: "inherit",
              color: isActive ? C.accent : C.muted,
              background: variant === "pill"
                ? isActive ? C.card : "transparent"
                : "transparent",
              borderRadius: variant === "pill" ? 8 : 0,
              borderBottom: variant === "underline"
                ? `2px solid ${isActive ? C.accent : "transparent"}`
                : "none",
              marginBottom: variant === "underline" ? -2 : 0,
              boxShadow: variant === "pill" && isActive ? "0 1px 4px #00000010" : "none",
              transition: "all .15s", whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = C.muted; }}
          >
            {tab.icon && <span style={{ fontSize: 14 }}>{tab.icon}</span>}
            {tab.label}
            {tab.badge != null && (
              <span style={{
                background: isActive ? C.accent : C.border,
                color: isActive ? "#fff" : C.sub,
                borderRadius: 20, padding: "1px 7px",
                fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center",
              }}>{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. STEPPER
//
//  Props
//  ─────
//  steps    { key, label, icon? }[]
//  active   string                  active step key
//  done     string[]                array of completed step keys
// ─────────────────────────────────────────────────────────────────────────────
export function Stepper({ steps = [], active, done = [] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
      {steps.map((step, i) => {
        const isDone = done.includes(step.key);
        const isActive = step.key === active;
        const color = isDone ? C.green : isActive ? C.accent : C.hint;
        const bg = isDone ? C.greenBg : isActive ? C.accent + "18" : C.bg;
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : 0, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: bg, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isDone ? 14 : 13, fontWeight: 700, color, transition: "all .2s" }}>
                {isDone ? "✓" : step.icon ?? (i + 1)}
              </div>
              <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? C.text : C.muted, whiteSpace: "nowrap", textAlign: "center" }}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, marginBottom: 20, background: isDone ? C.green : C.border, minWidth: 16, transition: "background .2s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. EMPTY STATE
//
//  Props
//  ─────
//  icon     string    emoji or icon (default "📭")
//  title    string
//  sub      string
//  action   ReactNode  optional CTA button
// ─────────────────────────────────────────────────────────────────────────────
export function EmptyState({ icon = "📭", title = "Nothing here", sub, action }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 24px", textAlign: "center", background: C.card, borderRadius: 14, border: `1px dashed ${C.border}` }}>
      <div style={{ fontSize: 42, marginBottom: 14, opacity: 0.5, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: C.muted, maxWidth: 320, lineHeight: 1.5 }}>{sub}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. SPINNER
//
//  Props
//  ─────
//  size     number    diameter in px (default 22)
//  color    string    (default C.accent)
//  overlay  boolean   full-parent overlay with semi-transparent bg
//  label    string    text below spinner (overlay only)
// ─────────────────────────────────────────────────────────────────────────────
export function Spinner({ size = 22, color, overlay = false, label }) {
  const c = color ?? C.accent;
  const spinner = (
    <div style={{ width: size, height: size, borderRadius: "50%", border: `${Math.max(2, size / 10)}px solid ${c}22`, borderTopColor: c, animation: "xc-spin .7s linear infinite", flexShrink: 0 }} />
  );
  if (!overlay) return spinner;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.card + "cc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 100, borderRadius: "inherit" }}>
      {spinner}
      {label && <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</span>}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. SECTION DIVIDER
//
//  Props
//  ─────
//  label    string    text in the middle of the line
//  action   ReactNode optional right-side action
// ─────────────────────────────────────────────────────────────────────────────
export function SectionDivider({ label, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {label && <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>{label}</span>}
      {action}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 8. KV TABLE  (key → value, for detail panels / summaries)
//
//  Props
//  ─────
//  rows   { label, value, icon?, badge?, color? }[]
//  cols   1 | 2       number of columns (default 1)
// ─────────────────────────────────────────────────────────────────────────────
export function KVTable({ rows = [], cols = 1 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "2px 16px" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
            {r.icon && <span style={{ fontSize: 13 }}>{r.icon}</span>}
            {r.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: r.color ?? C.text, textAlign: "right", marginLeft: 12 }}>
            {r.badge
              ? <span style={{ background: (r.color ?? C.accent) + "18", color: r.color ?? C.accent, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{r.value}</span>
              : r.value
            }
          </span>
        </div>
      ))}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
//  USAGE EXAMPLES (copy-paste ready)
// ─────────────────────────────────────────────────────────────────────────────
//
//  /* ── Dropdown ── */
//  const [city, setCity] = useState(null);
//  <Dropdown
//    label="City"
//    value={city}
//    onChange={(v, opt) => setCity(v)}
//    clearable
//    options={[
//      { value: "mum", label: "Mumbai",    icon: "🏙", sub: "Maharashtra" },
//      { value: "del", label: "Delhi",     icon: "🏛", sub: "NCR" },
//      { value: "blr", label: "Bengaluru", icon: "🌿", sub: "Karnataka" },
//    ]}
//    footerButtons={[{ icon: "➕", label: "Add new city", onClick: () => openAddCity() }]}
//  />
//
//  /* ── MultiDropdown ── */
//  const [tags, setTags] = useState([]);
//  <MultiDropdown
//    label="Tags"
//    value={tags}
//    onChange={(vals) => setTags(vals)}
//    options={tagOptions}
//  />
//
//  /* ── Tabs ── */
//  const [tab, setTab] = useState("overview");
//  <Tabs
//    active={tab}
//    onChange={setTab}
//    variant="pill"
//    tabs={[
//      { key: "overview", label: "Overview", icon: "📊" },
//      { key: "invoices", label: "Invoices",  icon: "🧾", badge: 12 },
//      { key: "settings", label: "Settings", icon: "⚙️" },
//    ]}
//  />
//
//  /* ── Stepper ── */
//  <Stepper
//    steps={[
//      { key: "info",    label: "Basic Info" },
//      { key: "billing", label: "Billing" },
//      { key: "review",  label: "Review" },
//      { key: "done",    label: "Done" },
//    ]}
//    active="billing"
//    done={["info"]}
//  />
//
//  /* ── EmptyState ── */
//  <EmptyState
//    icon="🧾"
//    title="No invoices yet"
//    sub="Create your first invoice to get started"
//    action={<Btn onClick={openNew}>+ New Invoice</Btn>}
//  />
//
//  /* ── Spinner ── */
//  <Spinner size={28} />
//  <div style={{ position: "relative", minHeight: 120 }}>
//    <Spinner overlay label="Loading data…" />
//  </div>
//
//  /* ── SectionDivider ── */
//  <SectionDivider label="Billing Details" />
//  <SectionDivider label="or" action={<Btn small variant="ghost">Import CSV</Btn>} />
//
//  /* ── KVTable ── */
//  <KVTable
//    cols={2}
//    rows={[
//      { label: "Invoice No",  value: "INV-2024-0042" },
//      { label: "Status",      value: "Paid", badge: true, color: C.green },
//      { label: "Amount",      value: "₹1,24,500", color: C.accent },
//      { label: "Due Date",    value: "31 Mar 2025", icon: "📅" },
//    ]}
//  />
// ─────────────────────────────────────────────────────────────────────────────