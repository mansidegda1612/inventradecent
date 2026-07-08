import { useEffect, useMemo, useRef, useState, useCallback , forwardRef ,useImperativeHandle } from "react";
import { fmt, fmtDateShort, fmtDateISO } from "../../utils/format";
import { C } from "../../utils/theme";
import * as XLSX from 'xlsx';

// ── theme tokens → CSS variables ───────────────────────────────────────────
// Single source of truth stays utils/theme.js (C). We mirror it into CSS vars
// once so new class-based styles can use var(--token) instead of inline
// styles, with zero visual change. Same pattern as the shimmer style
// injection already used by DataGrid below.
if (typeof document !== "undefined" && !document.getElementById("ui-theme-vars")) {
  const themeStyleEl = document.createElement("style");
  themeStyleEl.id = "ui-theme-vars";
  themeStyleEl.textContent = `:root{
    --accent:${C.accent}; --accentBg:${C.accentBg ?? C.accent}; --card:${C.card}; --border:${C.border};
    --borderLight:${C.borderLight ?? C.border}; --text:${C.text}; --muted:${C.muted}; --sub:${C.sub};
    --hint:${C.hint}; --bg:${C.bg}; --surface:${C.surface ?? C.card};
    --red:${C.red}; --redBg:${C.redBg}; --green:${C.green}; --greenBg:${C.greenBg};
    --blue:${C.blue ?? C.accent}; --blueBg:${C.blueBg ?? C.accentBg ?? C.accent};
    --amber:${C.amber ?? "#F59E0B"};
    --sidebarBg:${C.sidebarBg ?? C.card}; --sidebarBorder:${C.sidebarBorder ?? C.border}; --sidebarText:${C.sidebarText ?? C.text};
  }`;
  document.head.appendChild(themeStyleEl);
}

// ─── BUTTON ──────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", small, danger, style: s, disabled, autoFocus, className: extraCls }) {
  const v = danger ? "danger" : variant;
  const cls = ["ui-btn", `ui-btn-${v}`, small ? "ui-btn-small" : "", disabled ? "ui-btn-disabled" : "", extraCls || ""]
    .filter(Boolean).join(" ");
  return (
    <button
      autoFocus={autoFocus}
      className={cls}
      style={s}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ─── CARD ────────────────────────────────────────────────────────────────────
export function Card({ children, style: s, title, action, noPad, className }) {
  return (
    <div className={`ui-card ${className || ""}`} style={s}>
      {title && (
        <div className="ui-card-head">
          <span className="ui-card-title">{title}</span>
          {action}
        </div>
      )}
      <div className={noPad ? "ui-card-body-nopad" : "ui-card-body"}>{children}</div>
    </div>
  );
}

// ─── BADGE ───────────────────────────────────────────────────────────────────
export function Badge({ children, color = C.accent }) {
  return (
    <span className="ui-badge" style={{ background: color + "18", color }}>
      {children}
    </span>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, color, bg, icon, sub }) {
  return (
    <div className="ui-statcard">
      <div className="ui-statcard-top">
        <span className="ui-statcard-label">{label}</span>
        <div className="ui-statcard-icon" style={{ background: bg }}>{icon}</div>
      </div>
      <div className="ui-statcard-value" style={{ color }}>{value}</div>
      {sub && <div className="ui-statcard-sub">{sub}</div>}
    </div>
  );
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div
      className="ui-modal-overlay"
      style={window.innerHeight < 600 ? { alignItems: "flex-start" } : undefined}
    >
      <div className="ui-modal-box" style={{ maxWidth: width }}>
        <div className="ui-modal-head">
          <span className="ui-modal-title">{title}</span>
          <button onClick={onClose} className="ui-modal-close">×</button>
        </div>
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── FIELD ───────────────────────────────────────────────────────────────────
export function Field({ label, children, required }) {
  return (
    <div className="ui-field">
      <label className="ui-field-label">
        {label}{required && <span className="ui-field-required"> *</span>}
      </label>
      {children}
    </div>
  );
}

// ─── PAGE HEADER ─────────────────────────────────────────────────────────────
export function PageHeader({ title, sub, action }) {
  return (
    <div className="ui-pageheader">
      <div>
        <h1 className="ui-pageheader-title">{title}</h1>
        {sub && <p className="ui-pageheader-sub">{sub}</p>}
      </div>
      {action && <div className="ui-pageheader-action">{action}</div>}
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
          className="ui-datefilter-input"
        />
        <span className="date-filter-sep">→</span>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          className="ui-datefilter-input"
        />
        <Btn
          small
          variant="ghost"
          onClick={() => {
            const now = new Date();
            setFrom(fmtDateISO(new Date(now.getFullYear(), 0, 1)));
            setTo(fmtDateISO(now));
          }}
        >
          This Year
        </Btn>
        <Btn
          small
          variant="ghost"
          onClick={() => {
            const now = new Date();
            const first = fmtDateISO(new Date(now.getFullYear(), now.getMonth(), 1));
            const last = fmtDateISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
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

//whatsapp icon 
export function WhatsAppIcon({ size = 18 }) {
   return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <path
        fill="#fff"
        d="M21.6 18.3c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.08-1.76-.88-2.9-1.57-4.06-3.55-.31-.53.31-.49.88-1.64.1-.2.05-.37-.05-.52-.1-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.68-.51-.17-.01-.37-.01-.57-.01-.2 0-.53.08-.8.38-.28.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.08 3.17 5.03 4.32 2.96 1.15 2.96.77 4.02.65 1.06-.13 1.98-.77 2.35-1.49.37-.72.37-1.34.26-1.49-.1-.15-.3-.2-.6-.35z"
      />
      <path
        fill="#fff"
        d="M16 6.4c-5.3 0-9.6 4.3-9.6 9.6 0 1.83.5 3.55 1.38 5.02L6.4 25.6l4.7-1.44a9.55 9.55 0 0 0 4.9 1.34c5.3 0 9.6-4.3 9.6-9.6 0-5.3-4.3-9.5-9.6-9.5zm0 17.4c-1.6 0-3.1-.44-4.4-1.2l-.3-.18-3.13.96.97-3.06-.2-.32a7.9 7.9 0 0 1-1.24-4.24 8.3 8.3 0 0 1 16.6 0c0 4.58-3.72 8.24-8.3 8.24z"
      />
    </svg>
  );
}


//  ─── Tost message ──────────────────────────────
export function ToastProvider({ open, msg, type }) {
  if (!open) return null;
  return (
    <div className={`ui-toast ${type === "error" ? "ui-toast-error" : "ui-toast-success"}`}>
      {msg}
    </div>
  );
}

//  ─── confirmation Box message ──────────────────────────────
export function ConfirmModal({ open, onClose, onConfirm, title = "Confirmtion", message = "Are you sure?" }) {
  return (
    <Modal open={open} onClose={onClose} width={400} title={title}>
      <div>
        <p className="ui-confirm-msg">{message}</p>

        <div className="ui-confirm-actions">
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

// ─── balance pill ─────────────────────────────────────────────────────────────
export function BalancePill({ value, labels = ["Rec", "Pay"] }) {
  const n = Number(value) || 0;
  const isPositive = n >= 0;
  return (
    <span className={`ui-balancepill ${isPositive ? "ui-balancepill-pos" : "ui-balancepill-neg"}`}>
      {fmt(Math.abs(n))}
      <span className="ui-balancepill-label">
        {isPositive ? labels[0] : labels[1]}
      </span>
    </span>
  );
}


/** Returns { from, to } for the current Indian financial year (Apr 1 – Mar 31). */
function currentFinancialYear() {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: fmtDateISO(new Date(y, 3, 1)),   // Apr 1
    to: fmtDateISO(new Date(y + 1, 2, 31)), // Mar 31
  };
}

/** Very small XLSX writer – no dependency needed.
 *  Produces a proper .xlsx file from an array of objects.
 */
function exportToExcel(rows, columns, filename = "export.xlsx") {
  // Build array of row objects
  const header = columns.reduce((acc, c) => {
    acc[c.key] = c.label;
    return acc;
  }, {});

  const data = rows.map(row =>
    columns.reduce((acc, c) => {
      acc[c.key] = c.exportValue ? c.exportValue(row[c.key], row) : (row[c.key] ?? "");
      return acc;
    }, {})
  );

  // Create worksheet with header row first
  const ws = XLSX.utils.json_to_sheet([header, ...data], { skipHeader: true });

  // Bold the header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[cellAddr]) {
      ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: "E8EEF7" } } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}


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
  // date filter
  dateFilter = false,
  // slots
  headerExtra = null,
  footerExtra = null,
  // excel export filename
  exportFilename = "export.xlsx",
}) {
  // ── financial year defaults ───────────────────────────────────────────────
  const fyDefault = useMemo(() => currentFinancialYear(), []);

  // ── state ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    () => initialPageSize ?? Math.max(5, Math.floor((window.innerHeight - 220) / 45))
  );
  const [selected, setSelected] = useState(new Set());
  const [visibleKeys, setVisibleKeys] = useState(
    () => columns.filter(c => (c.visibleIn ?? "both") !== "excel").map(c => c.key)
  );
  const [colDropOpen, setColDropOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // date range
  const [dateFrom, setDateFrom] = useState(fyDefault.from);
  const [dateTo, setDateTo] = useState(fyDefault.to);

  const colDropRef = useRef(null);
  const tableRef = useRef(null);
  const searchDebounce = useRef(null);
  const focusedIdxRef = useRef(null);
  const prevSearch = useRef(search);
  const prevDateFrom = useRef(dateFrom);
  const prevDateTo = useRef(dateTo);

  const isLoading = loading || internalLoading;
  focusedIdxRef.current = focusedIdx;

  // ── fetch helper ──────────────────────────────────────────────────────────
  const buildParams = useCallback((overrides = {}) => ({
    page, pageSize, search, sortKey, sortDir,
    ...(dateFilter ? { dateFrom, dateTo } : {}),
    ...overrides,
  }), [page, pageSize, search, sortKey, sortDir, dateFilter, dateFrom, dateTo]);

  const doFetch = useCallback(async (params) => {
    if (!onFetch) return;
    setInternalLoading(true);
    try { await onFetch(params); }
    finally { setInternalLoading(false); }
  }, [onFetch]);

  // ── lazy fetch effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!lazy) { setPage(1); return; }

    const searchChanged = search !== prevSearch.current;
    const dateFromChanged = dateFrom !== prevDateFrom.current;
    const dateToChanged = dateTo !== prevDateTo.current;

    prevSearch.current = search;
    prevDateFrom.current = dateFrom;
    prevDateTo.current = dateTo;

    if (searchChanged || dateFromChanged || dateToChanged) {
      clearTimeout(searchDebounce.current);
      searchDebounce.current = setTimeout(() => {
        setPage(1);
        doFetch(buildParams({ page: 1 }));
      }, 300);
      return () => clearTimeout(searchDebounce.current);
    }

    doFetch(buildParams());
  }, [lazy, page, pageSize, search, sortKey, sortDir, dateFrom, dateTo]);

  useEffect(() => { setFocusedIdx(null); }, [page]);

  // close col-dropdown on outside click
  useEffect(() => {
    const h = e => {
      if (colDropRef.current && !colDropRef.current.contains(e.target))
        setColDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── client-side filter / sort ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (lazy) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      !q || Object.values(row).some(v => String(v ?? "").toLowerCase().includes(q))
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

  // columns split by visibleIn
  const gridCols = columns.filter(c => (c.visibleIn ?? "both") !== "excel");
  const excelCols = columns.filter(c => (c.visibleIn ?? "both") !== "grid");
  const visibleCols = gridCols.filter(c => visibleKeys.includes(c.key));

  const from = Math.min((safePage - 1) * pageSize + 1, total);
  const to = Math.min(safePage * pageSize, total);

  const focusedRow = focusedIdx !== null ? pageRows[focusedIdx] ?? null : null;
  const allPageSelected =
    pageRows.length > 0 && pageRows.every(r => selected.has(r.id));

  // ── actions ───────────────────────────────────────────────────────────────
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
  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const toggleCol = key => {
    setVisibleKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // ── excel export ──────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
  setExportLoading(true);
  try {
    let rows;
    if (lazy) {
      if (onFetch) {
        const params = buildParams({ page: 1, pageSize: 999999, exportAll: true });
        let res = await onFetch(params);
        rows = res; // parent must have updated `data` by now
      } else {
        rows = [];
      }
    } else {
      rows = sorted;
    }
    await exportToExcel(rows, excelCols, exportFilename);
  } finally {
    setExportLoading(false);
  }
}, [lazy, sorted, data, excelCols, onFetch, buildParams, exportFilename]);
  // ── page number list ──────────────────────────────────────────────────────
  const pageNums = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= safePage - 1 && i <= safePage + 1))
      pageNums.push(i);
    else if (pageNums[pageNums.length - 1] !== "…")
      pageNums.push("…");
  }

  // ── shimmer style injection ───────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("dg-shimmer-style")) return;
    const s = document.createElement("style");
    s.id = "dg-shimmer-style";
    s.textContent = `
      @keyframes dg-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      tr[data-idx]:focus { outline:none; }
    `;
    document.head.appendChild(s);
  }, []);

  // ── keyboard ──────────────────────────────────────────────────────────────
  const parseHotkey = raw => {
    const parts = raw.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    return { ctrl: parts.includes("ctrl"), alt: parts.includes("alt"), shift: parts.includes("shift"), key };
  };

  const handleKeyDown = useCallback(e => {
    const tag = e.target?.tagName?.toLowerCase();
    const inInput = tag === "input" || tag === "textarea" || tag === "select";

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!tableRef.current?.closest("[data-dg-root]")?.contains(document.activeElement) &&
        !tableRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      const len = pageRows.length;
      if (!len) return;
      setFocusedIdx(prev => {
        if (prev === null) return e.key === "ArrowDown" ? 0 : len - 1;
        return e.key === "ArrowDown" ? Math.min(prev + 1, len - 1) : Math.max(prev - 1, 0);
      });
      return;
    }
    if (e.key === "Enter" && selectable && !inInput) {
      const idx = focusedIdxRef.current;
      if (idx !== null && pageRows[idx]) { e.preventDefault(); toggleRow(pageRows[idx].id); }
      return;
    }
    if (inInput && !e.ctrlKey && !e.altKey) return;
    const btns = [...footerButtons, ...HeaderButtons];
    for (const btn of btns) {
      if (!btn.hotkey) continue;
      const hk = parseHotkey(btn.hotkey);
      const keyMatch = e.key.toLowerCase() === hk.key || e.code.toLowerCase() === hk.key;
      if (keyMatch && !!e.ctrlKey === hk.ctrl && !!e.altKey === hk.alt && !!e.shiftKey === hk.shift) {
        e.preventDefault();
        const idx = focusedIdxRef.current;
        const fr = idx !== null ? pageRows[idx] ?? null : null;
        btn.onClick?.(Array.from(selected), data, fr);
        return;
      }
    }
  }, [pageRows, selected, footerButtons, data]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (focusedIdx === null || !tableRef.current) return;
    tableRef.current.querySelectorAll("tbody tr[data-idx]")[focusedIdx]
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx]);

  // ── row state → class helper (was inline rowBg()) ─────────────────────────
  const rowClass = (isSelected, isFocused) => {
    let c = "dg-row";
    if (isSelected) c += " dg-row-selected";
    if (isFocused) c += " dg-row-focused";
    return c;
  };

  // ── quick-date helpers ────────────────────────────────────────────────────
  const setThisMonth = () => {
    const now = new Date();
    setDateFrom(fmtDateISO(new Date(now.getFullYear(), now.getMonth(), 1)));
    setDateTo(fmtDateISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  };
  const setThisQuarter = () => {
    const now = new Date();
    // Indian financial quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
    const m = now.getMonth(); // 0-indexed
    const fyYear = m >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const qStarts = [3, 6, 9, 0]; // Apr, Jul, Oct, Jan (month index)
    const qIdx = m >= 9 ? 2 : m >= 6 ? 1 : m >= 3 ? 0 : 3;
    const qStartMonth = qStarts[qIdx];
    const qStartYear = qStartMonth === 0 ? fyYear + 1 : fyYear;
    const qStart = new Date(qStartYear, qStartMonth, 1);
    const qEnd = new Date(qStartYear, qStartMonth + 3, 0);
    setDateFrom(fmtDateISO(qStart));
    setDateTo(fmtDateISO(qEnd));
  };
  const setThisFY = () => {
    const fy = currentFinancialYear();
    setDateFrom(fy.from);
    setDateTo(fy.to);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="dg-wrap" data-dg-root="1">

      {/* ── TOOLBAR ── */}
      <div className="dg-toolbar">
        <div className="dg-toolbar-left">
          {title && <span className="dg-title">{title}</span>}
          {headerExtra && <div className="dg-header-extra">{headerExtra}</div>}
          {HeaderButtons.length > 0 && (
            <div className="dg-actions">
              {HeaderButtons.map(btn => (
                <button key={btn.key} className={`dg-action-btn dg-action-btn-${btn.variant || "default"}`}
                  onClick={() => btn.onClick?.(Array.from(selected), data, focusedRow)}
                  title={btn.hotkey ? `Shortcut: ${btn.hotkey}` : undefined}
                >
                  {btn.icon && <span>{btn.icon}</span>}
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── DATE FILTER BAR ── */}
        {dateFilter && (
          <div className="dg-datebar">
            {/* Quick selectors */}
            {[
              { label: "This Month", fn: setThisMonth },
              { label: "This Quarter", fn: setThisQuarter },
              { label: "This FY", fn: setThisFY },
            ].map(q => (
              <button key={q.label} className="dg-date-quick-btn" onClick={q.fn}>{q.label}</button>
            ))}
            {/* Vertical divider */}
            <span className="dg-date-divider" />

            {/* From date */}
            <input
              type="date" value={dateFrom}
              className="dg-date-input"
              onChange={e => setDateFrom(e.target.value)}
            />

            {/* Arrow separator */}
            <span className="dg-date-sep">→</span>

            {/* To date */}
            <input
              type="date" value={dateTo}
              className="dg-date-input"
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        )}

        <div className="dg-toolbar-right">
          {/* Search */}
          <div className="dg-search-wrap">
            <span className="dg-search-icon">🔍</span>
            <input
              className="dg-search-input"
              placeholder="Search anything…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Excel export */}
          <button
            className="dg-excel-btn"
            disabled={exportLoading}
            onClick={handleExport}
            title="Export to Excel"
          >
            {exportLoading ? "⏳" : "⬇️"}
          </button>

          {/* Column visibility */}
          <div className="dg-coldrop-wrap" ref={colDropRef}>
            <button
              className="dg-col-btn"
              onClick={() => setColDropOpen(o => !o)}
            >⊞</button>
            {colDropOpen && (
              <div className="dg-col-dropdown">
                {gridCols.map(c => (
                  <label key={c.key} className="dg-col-item">
                    <input type="checkbox" checked={visibleKeys.includes(c.key)} onChange={() => toggleCol(c.key)}
                      className="dg-col-checkbox" />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SELECTION BANNER ── */}
      {selected.size > 0 && (
        <div className="dg-selbar">
          ✓&nbsp;<strong>{selected.size}</strong>&nbsp;row{selected.size !== 1 ? "s" : ""} selected
          <button
            className="dg-action-btn dg-action-btn-danger dg-selbar-clear"
            onClick={() => setSelected(new Set())}
          >✕ Clear</button>
        </div>
      )}

      {/* ── TABLE (desktop / tablet) ── */}
      <div className="dg-table-wrap">
        <table className="dg-table" ref={tableRef}>
          <thead>
            <tr className="dg-thead">
              {selectable && (
                <th className="dg-th-check">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleAll}
                    className="dg-row-checkbox" />
                </th>
              )}
              {visibleCols.map(c => {
                const sortable = c.sortable !== false;
                const isActive = sortKey === c.key;
                const icon = isActive ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";
                return (
                  <th key={c.key}
                    className={`dg-th ${sortable ? "dg-th-sortable" : ""}`}
                    style={c.width ? { width: c.width } : undefined}
                    onClick={() => sortable && handleSort(c.key)}
                  >
                    {c.label}
                    {sortable && (
                      <span className={`dg-sort-icon ${isActive ? "dg-sort-icon-active" : ""}`}>
                        {icon}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i}>
                  {selectable && <td className="dg-td-check"><div className="dg-skeleton" style={{ width: 14, height: 14, borderRadius: 3 }} /></td>}
                  {visibleCols.map(c => (
                    <td key={c.key} className="dg-td"><div className="dg-skeleton" style={{ width: `${45 + (i * 7 + c.key.length * 5) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
              : pageRows.length === 0
                ? <tr><td colSpan={visibleCols.length + (selectable ? 1 : 0)}>
                  <div className="dg-empty"><div className="dg-empty-icon">📭</div>{emptyText}</div>
                </td></tr>
                : pageRows.map((row, ri) => {
                  const isSelected = selected.has(row.id);
                  const isFocused = focusedIdx === ri;
                  return (
                    <tr key={row.id ?? ri} data-idx={ri} tabIndex={-1}
                      className={rowClass(isSelected, isFocused)}
                      onClick={() => setFocusedIdx(ri)}
                    >
                      {selectable && (
                        <td className="dg-td-check">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)}
                            onClick={e => e.stopPropagation()}
                            className="dg-row-checkbox" />
                        </td>
                      )}
                      {visibleCols.map(c => (
                        <td key={c.key} className="dg-td">
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

      {/* ── CARDS (mobile) ── same data/columns, stacked layout for small screens.
          Rendered alongside the table; CSS toggles which one is visible per breakpoint,
          so no extra JS state and all existing behavior (selection, focus, actions) is reused. ── */}
      <div className="dg-cards">
        {isLoading
          ? Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
            <div className="dg-card" key={i}>
              <div className="dg-skeleton" style={{ width: "60%", height: 14, marginBottom: 10 }} />
              <div className="dg-skeleton" style={{ width: "90%" }} />
              <div className="dg-skeleton" style={{ width: "75%", marginTop: 6 }} />
            </div>
          ))
          : pageRows.length === 0
            ? <div className="dg-empty"><div className="dg-empty-icon">📭</div>{emptyText}</div>
            : pageRows.map((row, ri) => {
              const isSelected = selected.has(row.id);
              const isFocused = focusedIdx === ri;
              // first visible column reads as the card's heading; rest render as label:value rows
              const [headCol, ...restCols] = visibleCols;
              return (
                <div key={row.id ?? ri}
                  className={`dg-card ${isSelected ? "dg-row-selected" : ""} ${isFocused ? "dg-row-focused" : ""}`}
                  onClick={() => setFocusedIdx(ri)}
                >
                  <div className="dg-card-head">
                    {selectable && (
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)}
                        onClick={e => e.stopPropagation()}
                        className="dg-row-checkbox" />
                    )}
                    {headCol && (
                      <div className="dg-card-heading">
                        {headCol.render ? headCol.render(row[headCol.key], row) : (row[headCol.key] ?? "—")}
                      </div>
                    )}
                  </div>
                  {restCols.map(c => (
                    <div className="dg-card-row" key={c.key}>
                      <span className="dg-card-label">{c.label}</span>
                      <span className="dg-card-value">
                        {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
                      </span>
                    </div>
                  ))}
                  {footerButtons.length > 0 && (
                    <div className="dg-card-actions">
                      {footerButtons.map(btn => (
                        <button key={btn.key}
                          className={`dg-action-btn dg-action-btn-${btn.variant || "default"}`}
                          title={btn.label}
                          onClick={e => {
                            e.stopPropagation();
                            setFocusedIdx(ri);
                            btn.onClick?.(Array.from(selected), data, row);
                          }}
                        >
                          {btn.icon && <span className="dg-action-btn-icon">{btn.icon}</span>}
                          <span className="dg-action-btn-label">{btn.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
        }
      </div>

      {/* ── FOOTER ── */}
      <div className="dg-footer">
        <div className="dg-footer-left">
          {footerExtra && <div className="dg-footer-extra">{footerExtra}</div>}
          {footerButtons.length > 0 && (
            <div className="dg-actions dg-footer-actions">
              {footerButtons.map(btn => (
                <button key={btn.key} className={`dg-action-btn dg-action-btn-${btn.variant || "default"}`}
                  onClick={() => btn.onClick?.(Array.from(selected), data, focusedRow)}
                  title={btn.hotkey ? `Shortcut: ${btn.hotkey}` : undefined}
                >
                  {btn.icon && <span>{btn.icon}</span>}
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dg-footer-right">
          <span className="dg-footer-info">
            {total === 0
              ? "No records"
              : <>{from}–{to} of <strong className="dg-footer-info-strong">{total}</strong> records</>}
          </span>
          <div className="dg-pagination">
            <button className="dg-page-btn" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {pageNums.map((p, i) =>
              p === "…"
                ? <span key={`e${i}`} className="dg-page-ellipsis">…</span>
                : (
                  <button key={p} className={`dg-page-btn ${p === safePage ? "dg-page-btn-active" : ""}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                )
            )}
            <button className="dg-page-btn" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── USAGE EXAMPLE ────────────────────────────────────────────────────────────
//
// const columns = [
//   { key: "date",   label: "Date",   visibleIn: "both"  },
//   { key: "party",  label: "Party",  visibleIn: "both"  },
//   { key: "amount", label: "Amount", visibleIn: "both",
//     exportValue: (v) => Number(v) },           // raw number in Excel
//   { key: "actions",label: "Actions",visibleIn: "grid"  }, // grid only, skip excel
//   { key: "gstin",  label: "GSTIN",  visibleIn: "excel" }, // excel only, hidden in grid
// ];
//
// // Client-side:
// <DataGrid
//   title="Transactions"
//   columns={columns}
//   data={rows}
//   dateFilter                        // ← turns on the date bar (defaults to current FY)
//   exportFilename="transactions.xlsx"
// />
//
// // Lazy (server-side):
// <DataGrid
//   title="Transactions"
//   columns={columns}
//   data={rows}
//   lazy
//   total={totalCount}
//   dateFilter
//   exportFilename="transactions.xlsx"
//   onFetch={async ({ page, pageSize, search, sortKey, sortDir, dateFrom, dateTo, exportAll }) => {
//     const result = await api.getTransactions({
//       page, pageSize, search, sortKey, sortDir,
//       dateFrom, dateTo,
//       limit: exportAll ? 999999 : pageSize,
//     });
//     setRows(result.rows);
//     setTotalCount(result.total);
//   }}
// />


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
export const Dropdown = forwardRef(function Dropdown({
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
  displayField = "name",
  allowSearch = true,
} , ref) {

 const triggerRef = useRef(null); // add this ref for the trigger div

  // expose focus() to parent
  useImperativeHandle(ref, () => ({
  focus: () => triggerRef.current?.focus(),
  focusAt: (idx) => {
    triggerRef.current?.focus();
    setFocIdx(idx);      // jump to specific index after open
  }
}));

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
      if (wrapRef.current && !wrapRef.current.contains(e.target) ) {
        // setOpen(false);
        // setSearch("");
        // setFocIdx(-1);
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
  return (
    <div className="dd-wrap" style={{ width }} ref={wrapRef} onKeyDown={handleKeyDown}>
      <div
        className={`dd-trigger ${open ? "dd-trigger-open" : ""} ${disabled ? "dd-trigger-disabled" : ""} ${selected ? "dd-trigger-hasvalue" : ""}`}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled} role="combobox" aria-expanded={open}
        onFocus={() => {
          if (isShiftTab) { SetIsShiftTab(false); return; }
          !disabled && setOpen(true);
        }}>

        <span className="dd-trigger-value">
          {selected?.icon && <span className="dd-trigger-value-icon">{selected.icon}</span>}
          <span className="dd-trigger-value-text">
            {selected ? selected[displayField] : placeholder}
          </span>
        </span>
        <span className="dd-trigger-right">
          {clearable && selected && (
            <button className="dd-clear-btn" onClick={e => { e.stopPropagation(); onChange?.(null, null); }}>✕</button>
          )}
          <span className={`dd-caret ${open ? "dd-caret-open" : ""}`}>▾</span>
        </span>
      </div>

      {open && (
        <div className="dd-dropdown">
          {/* Search */}
          {allowSearch && (<div className="dd-search-wrap">
            <span className="dd-search-icon">🔍</span>
            <input
              tabIndex={-1}
              ref={searchRef}
              className="dd-search-input"
              placeholder="Search…"
              value={search}
              onChange={e => { setSearch(e.target.value); setFocIdx(0); }}
            />
          </div>)}

          {/* List */}
          <div className="dd-list" ref={listRef}>
            {filtered.length === 0
              ? <div className="dd-nomatch">📭 No matches</div>
              : filtered.map((opt, i) => {
                const isFoc = i === focIdx;
                const isSel = opt[keyField] == value;
                return (
                  <div
                    key={opt[keyField]}
                    data-xc-item
                    className={`dd-item ${isFoc ? "dd-item-focused" : ""} ${isSel ? "dd-item-selected" : ""} ${opt.disabled ? "dd-item-disabled" : ""}`}
                    onClick={() => handleItemClick(opt, i)}
                  >
                    {opt.icon && <span className="dd-item-icon">{opt.icon}</span>}
                    <div className="dd-item-body">
                      <div className={`dd-item-label ${isSel ? "dd-item-label-selected" : ""}`}>{opt[displayField]}</div>
                      {opt.sub && <div className="dd-item-sub">{opt.sub}</div>}
                    </div>
                    {isSel && <span className="dd-item-check">✓</span>}
                  </div>
                );
              })
            }
          </div>

          {/* Footer buttons */}
          {footerButtons.length > 0 && (
            <div className="dd-footer">
              {footerButtons.map((btn, i) => (
                <button
                  key={i}
                  tabIndex={-1}
                  className="dd-footbtn"
                  onClick={() => fireBtnAction(btn)}
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
});


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

  return (
    <div className="dd-wrap" style={{ width }} ref={wrapRef} onKeyDown={handleKeyDown} tabIndex={disabled ? -1 : 0}>
      {label && <label className="dd-label">{label}</label>}

      <div className={`dd-multi-trigger ${open ? "dd-trigger-open" : ""} ${disabled ? "dd-trigger-disabled" : ""}`} onClick={() => !disabled && setOpen(o => !o)}>
        {selectedOpts.length === 0
          ? <span className="dd-multi-placeholder">{placeholder}</span>
          : <>
            {visibleChips.map(o => (
              <span key={o.value} className="dd-chip">
                {o.icon && <span>{o.icon}</span>}
                {o.label}
                <button className="dd-chip-remove" onClick={e => { e.stopPropagation(); toggle(o); }}>✕</button>
              </span>
            ))}
            {extra > 0 && <span className="dd-chip-extra">+{extra} more</span>}
          </>
        }
        <span className={`dd-caret dd-caret-multi ${open ? "dd-caret-open" : ""}`}>▾</span>
      </div>

      {open && (
        <div className="dd-dropdown">
          <div className="dd-search-wrap">
            <span className="dd-search-icon">🔍</span>
            <input
              ref={searchRef}
              className="dd-search-input"
              placeholder="Search…"
              value={search}
              onChange={e => { setSearch(e.target.value); setFocIdx(0); }}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="dd-list dd-list-tall" ref={listRef}>
            {filtered.length === 0
              ? <div className="dd-nomatch">📭 No matches</div>
              : filtered.map((opt, i) => {
                const isSel = value.includes(opt.value);
                const isFoc = i === focIdx;
                return (
                  <div key={opt.value} data-xc-item
                    className={`dd-item ${isFoc ? "dd-item-focused" : ""} ${opt.disabled ? "dd-item-disabled" : ""}`}
                    onClick={() => toggle(opt)} onMouseEnter={() => setFocIdx(i)}
                  >
                    <div className={`dd-check ${isSel ? "dd-check-on" : ""}`}>
                      {isSel && <span className="dd-check-tick">✓</span>}
                    </div>
                    {opt.icon && <span className="dd-item-icon">{opt.icon}</span>}
                    <div className="dd-item-body">
                      <div className={`dd-item-label ${isSel ? "dd-item-label-selected" : ""}`}>{opt.label}</div>
                      {opt.sub && <div className="dd-item-sub">{opt.sub}</div>}
                    </div>
                  </div>
                );
              })
            }
          </div>

          <div className="dd-footer">
            {selectedOpts.length > 0 && (
              <button className="dd-clearall-btn" onClick={() => onChange?.([], [])}>✕ Clear all</button>
            )}
            {footerButtons.map((btn, i) => (
              <button key={i} className="dd-footbtn"
                onClick={() => { btn.onClick?.(); setOpen(false); }}
              >
                {btn.icon && <span>{btn.icon}</span>}
                {btn.label}
              </button>
            ))}
            <button className="dd-done-btn" onClick={() => setOpen(false)}>✓ Done</button>
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
    <div className={`ui-tabs ui-tabs-${variant}`}>
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange?.(tab.key)}
            className={`ui-tab ui-tab-${variant} ${isActive ? "ui-tab-active" : ""}`}
          >
            {tab.icon && <span className="ui-tab-icon">{tab.icon}</span>}
            {tab.label}
            {tab.badge != null && (
              <span className={`ui-tab-badge ${isActive ? "ui-tab-badge-active" : ""}`}>{tab.badge}</span>
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
    <div className="ui-stepper">
      {steps.map((step, i) => {
        const isDone = done.includes(step.key);
        const isActive = step.key === active;
        const state = isDone ? "done" : isActive ? "active" : "pending";
        return (
          <div key={step.key} className="ui-step" style={{ flex: i < steps.length - 1 ? 1 : 0 }}>
            <div className="ui-step-col">
              <div className={`ui-step-circle ui-step-circle-${state}`}>
                {isDone ? "✓" : step.icon ?? (i + 1)}
              </div>
              <span className={`ui-step-label ${isActive ? "ui-step-label-active" : ""}`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`ui-step-line ui-step-line-${isDone ? "done" : "pending"}`} />
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
    <div className="ui-emptystate">
      <div className="ui-emptystate-icon">{icon}</div>
      <div className="ui-emptystate-title">{title}</div>
      {sub && <div className="ui-emptystate-sub">{sub}</div>}
      {action && <div className="ui-emptystate-action">{action}</div>}
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
    <div
      className="ui-spinner"
      style={{ width: size, height: size, borderWidth: Math.max(2, size / 10), borderColor: c + "22", borderTopColor: c }}
    />
  );
  if (!overlay) return spinner;
  return (
    <div className="ui-spinner-overlay" style={{ background: C.card + "cc" }}>
      {spinner}
      {label && <span className="ui-spinner-label">{label}</span>}
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
    <div className="ui-sectiondivider">
      <div className="ui-sectiondivider-line" />
      {label && <span className="ui-sectiondivider-label">{label}</span>}
      {action}
      <div className="ui-sectiondivider-line" />
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
    <div className="ui-kvtable" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {rows.map((r, i) => (
        <div key={i} className="ui-kvtable-row">
          <span className="ui-kvtable-label">
            {r.icon && <span className="ui-kvtable-label-icon">{r.icon}</span>}
            {r.label}
          </span>
          <span className="ui-kvtable-value" style={r.color ? { color: r.color } : undefined}>
            {r.badge
              ? <span className="ui-kvtable-badge" style={{ background: (r.color ?? C.accent) + "18", color: r.color ?? C.accent }}>{r.value}</span>
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


export function ExpandableItemRow({ item, index, onUpdate, onRemove }) {
  const [open, setOpen] = useState(false);
  const lineTotal = (item.taxable_amount || 0) + (item.CGST || 0) + (item.SGST || 0);

  return (
    <>
      {/* ── Main Row ── */}
      <tr className={`se-row-main ${open ? "se-row-expanded" : ""}`}>
        <td className="se-td-expand">
          <button
            className={`se-expand-btn ${open ? "se-expand-btn-open" : ""}`}
            onClick={() => setOpen(o => !o)}
            title={open ? "Collapse GST details" : "Expand GST details"}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5 3.5L9 7L5 10.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </td>
        <td className="se-td-name">{item.name}</td>
        <td>
          <input
            type="number"
            min={1}
            className="qty"
            value={item.qty}
            onChange={e => onUpdate(index, "qty", e.target.value)}
          />
        </td>
        <td>
          <input
            type="number"
            min={0}
            className="rate"
            value={item.rate}
            onChange={e => onUpdate(index, "rate", e.target.value)}
          />
        </td>
        <td className="se-td-taxable">{fmt(item.taxable_amount)}</td>
        <td className="se-td-total">{fmt(lineTotal)}</td>
        <td className="center">
          <Btn small danger onClick={() => onRemove(index)}>×</Btn>
        </td>
      </tr>

      {/* ── Detail Row (GST breakdown) ── */}
      {open && (
        <tr className="se-row-detail">
          <td colSpan={7}>
            <div className="se-detail-grid">
              <div className="se-detail-field">
                <label className="se-detail-label">CGST %</label>
                <input
                  type="number"
                  min={0}
                  max={28}
                  className="se-detail-input"
                  value={item.cgst_pct}
                  onChange={e => onUpdate(index, "cgst_pct", e.target.value)}
                />
              </div>
              <div className="se-detail-field">
                <label className="se-detail-label">CGST Amt</label>
                <span className="se-detail-value">{fmt(item.CGST)}</span>
              </div>
              <div className="se-detail-field">
                <label className="se-detail-label">SGST %</label>
                <input
                  type="number"
                  min={0}
                  max={28}
                  className="se-detail-input"
                  value={item.sgst_pct}
                  onChange={e => onUpdate(index, "sgst_pct", e.target.value)}
                />
              </div>
              <div className="se-detail-field">
                <label className="se-detail-label">SGST Amt</label>
                <span className="se-detail-value">{fmt(item.SGST)}</span>
              </div>
              <div className="se-detail-field">
                <label className="se-detail-label">Taxable</label>
                <span className="se-detail-value se-detail-value-accent">
                  {fmt(item.taxable_amount)}
                </span>
              </div>
              <div className="se-detail-field">
                <label className="se-detail-label">Total GST</label>
                <span className="se-detail-value se-detail-value-accent">
                  {fmt(item.CGST + item.SGST)}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}