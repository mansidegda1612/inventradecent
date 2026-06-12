import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/theme";
import { fmt, fmtDate, fmtDateShort,fmtDateISO } from "../utils/format";
import { callAPI } from "../utils/callserver";
import {
  Btn, Card, Badge, Field, PageHeader, DateFilter, TableWrap,
  Spinner, DataGrid, Dropdown,BalancePill
} from "../components/ui";

// ─── helpers ─────────────────────────────────────────────────────────────────
function defaultFrom() {
  let now = new Date();
  return fmtDateISO(new Date(now.getFullYear(), 0, 1));
}
function defaultTo() {
  return fmtDateISO(new Date());
}



// ─── transaction type badge ───────────────────────────────────────────────────
function TransBadge({ type }) {
  const map = {
    SI: { label: "Sale", color: C.green },
    PI: { label: "Purchase", color: C.blue },
  };
  const { label, color } = map[type] || { label: type, color: C.hint };
  return (
    <span style={{
      background: color + "18", color,
      borderRadius: 6, padding: "2px 9px",
      fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
    }}>{label}</span>
  );
}

// ─── ledger balance stat (used in DataGrid headerExtra / footerExtra) ─────────
function LedgerBalanceStat({ label, value, flagDr = "Pay", flagCr = "Rec", size = "normal" }) {
  const n = Number(value) || 0;
  const isDebit = n >= 0;
  const isSmall = size === "small";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: isSmall ? 6 : 8,
      background: C.card,
      border: `1.5px solid ${C.border}`,
      borderRadius: isSmall ? 8 : 10,
      padding: isSmall ? "5px 10px" : "7px 14px",
      boxShadow: "0 1px 4px #00000008",
    }}>
      <span style={{
        fontSize: isSmall ? 10 : 11,
        fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: ".07em",
      }}>{label}</span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: isDebit ? C.greenBg :C.redBg ,
        color: isDebit ?  C.green: C.red ,
        border: `1px solid ${isDebit ?  C.green : C.red }33`,
        borderRadius: 5, padding: isSmall ? "2px 7px" : "3px 9px",
        fontSize: isSmall ? 11 : 12, fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {fmt(Math.abs(n))}
        <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.7 }}>
          {isDebit ?flagCr :  flagDr}
        </span>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AccountReports() {
  // tabs: "ledger" | "receivable" | "payable"
  const [tab, setTab] = useState("ledger");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  // accounts list (for ledger dropdown)
  const [accounts, setAccounts] = useState([]);
  const [selAcc, setSelAcc] = useState(null);

  // per-tab data
  const [ledger, setLedger] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [supplierBal, setSupplierBal] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── load accounts list once ──────────────────────────────────────────────
  useEffect(() => {
    callAPI("reports/accounts/accounts-list", "GET")
      .then(rows => {
        setAccounts(rows || []);
        if (rows?.length) setSelAcc(rows[0].id);
      })
      .catch(console.error);
  }, []);

  // ── load tab data ─────────────────────────────────────────────────────────
  const loadTab = useCallback(async (t, acc) => {
    setLoading(true);
    setError(null);
    try {
      if (t === "ledger") {
        if (!acc) return;
        const data = await callAPI(
          `reports/accounts/ledger?accountId=${acc}&from=${from}&to=${to}`, "GET"
        );
        setLedger(data);
      } else if (t === "receivable") {
        const data = await callAPI(
          `reports/accounts/outstanding?from=${from}&to=${to}`, "GET"
        );
        setOutstanding(data);
      } else if (t === "payable") {
        const data = await callAPI(
          `reports/accounts/supplier-balance?from=${from}&to=${to}`, "GET"
        );
        setSupplierBal(data);
      }
    } catch (e) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadTab(tab, selAcc);
  }, [tab, selAcc, from, to, loadTab]);

  // ── TABS config ───────────────────────────────────────────────────────────
  const TABS = [
    { key: "ledger", label: "📒 Ledger" },
    { key: "receivable", label: "📊 Outstanding Receivable" },
    { key: "payable", label: "🏭 Outstanding Payable" },
  ];

  // ── ledger DataGrid columns ───────────────────────────────────────────────
  const ledgerCols = [
    {
      key: "date", label: "Date",
      render: v => <span style={{ color: C.muted, fontSize: 12 }}>{fmtDateShort(v)}</span>,
    },
    {
      key: "trans_type", label: "Type", sortable: false,
      render: v => <TransBadge type={v} />,
    },
    {
      key: "bill_no", label: "Bill No",
      render: v => (
        <span style={{  fontSize: 12, color: C.accent, fontWeight: 600 }}>
          {v || "—"}
        </span>
      ),
    },
    {
      key: "_debit", label: "Payable",
      sortable: false,
      render: (_, row) =>
        row.trans_type === "PI"
          ? <span style={{ color: C.red, fontWeight: 600 }}>{fmt(row.final_amount)}</span>
          : <span style={{ color: C.hint }}>—</span>,
    },
    {
      key: "_credit", label: "Receivable",
      sortable: false,
      render: (_, row) =>
        row.trans_type === "SI"
          ? <span style={{ color: C.green, fontWeight: 600}}>{fmt(row.final_amount)}</span>
          : <span style={{ color: C.hint }}>—</span>,
    },
    {
      key: "running_balance", label: "Balance",
      render: v => <BalancePill value={v} />,
    },
  ];

  // ── outstanding DataGrid columns ─────────────────────────────────────────
  const outstandingCols = [
    { key: "name", label: "Customer", render: v => <span style={{ fontWeight: 600, color: C.text }}>{v}</span> },
    { key: "city", label: "City", render: v => <span style={{ color: C.muted }}>{v || "—"}</span> },
    { key: "contact_no", label: "Contact", render: v => <span style={{ color: C.muted }}>{v || "—"}</span> },
    { key: "opening", label: "Opening", render: v => <span>{fmt(v)}</span> },
    { key: "period_sales", label: "Sales", render: v => <span style={{ color: C.green, fontWeight: 600 }}>{fmt(v)}</span> },
    { key: "outstanding", label: "Outstanding", render: v => <BalancePill value={v} /> },
  ];

  // ── supplier / payable DataGrid columns ──────────────────────────────────
  const supplierCols = [
    { key: "name", label: "Supplier", render: v => <span style={{ fontWeight: 600, color: C.text }}>{v}</span> },
    { key: "city", label: "City", render: v => <span style={{ color: C.muted }}>{v || "—"}</span> },
    { key: "contact_no", label: "Contact", render: v => <span style={{ color: C.muted }}>{v || "—"}</span> },
    { key: "opening", label: "Opening", render: v => <span>{fmt(Math.abs(v))}</span> },
    { key: "period_purchases", label: "Purchases", render: v => <span style={{ color: C.blue, fontWeight: 600}}>{fmt(v)}</span> },
    { key: "payable", label: "Payable", render: v => <BalancePill value={v}  /> },
  ];

  // ── ledger: opening row injected before real txns ─────────────────────────
  // We prepend a synthetic opening row so it shows in the DataGrid body.
  // It has a reserved id so DataGrid key doesn't collide.
  const ledgerRows = ledger
    ? [
      {
        id: "__opening__",
        date: null,
        trans_type: null,
        bill_no: null,
        final_amount: ledger.account.opening,
        running_balance: ledger.account.opening,
        _isOpening: true,
      },
      ...ledger.txns.map(t => ({ ...t, id: t.id ?? `txn-${t.date}-${t.bill_no}` })),
    ]
    : [];

  // Override ledger cols to handle the synthetic opening row
  const ledgerColsWithOpening = ledgerCols.map(col => ({
    ...col,
    render: (v, row) => {
      if (row._isOpening) {
        if (col.key === "date") return (
          <span style={{ color: C.accent, fontWeight: 700, fontSize: 12 }}>◈ Opening Balance</span>
        );
        if (col.key === "running_balance") return <BalancePill value={row.running_balance} />;
        return <span style={{ color: C.hint }}>—</span>;
      }
      return col.render ? col.render(v, row) : (v ?? "—");
    },
  }));

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Account Reports"
        sub="Ledger, outstanding receivables and payable balances."
      />

      {/* Date filter */}
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

      {/* ── LEDGER TAB ───────────────────────────────────────────────────── */}
      {tab === "ledger" && (
        <>
          {loading && <div style={{ padding: 40, textAlign: "center"}}><Spinner size={28} /></div>}

          {!loading && (
            <DataGrid
              pageSize={8}
              columns={ledgerColsWithOpening}
              data={ledgerRows ?? []}
              emptyText="Select an account to view transactions"
              headerExtra={
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ minWidth: 220 }}>
                    <Dropdown
                      value={selAcc}
                      onChange={v => setSelAcc(v)}
                      options={accounts}
                      keyField="id"
                      displayField="name"
                      placeholder="Select account…"
                      clearable
                    />
                  </div>
                  <Btn small onClick={() => loadTab("ledger", selAcc)}>↺ Refresh</Btn>
                </div>
              }
              footerExtra={
                ledger && (
                  <LedgerBalanceStat
                    label="Closing Balance"
                    value={ledger.closing}
                  />
                )
              }
            />
          )}
        </>
      )}

      {/* ── OUTSTANDING RECEIVABLE TAB ───────────────────────────────────── */}
      {tab === "receivable" && (
        <>
          {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner size={28} /></div>}
          {!loading && outstanding && (
            <DataGrid
             pageSize={8}
              title="Outstanding Receivable"
              columns={outstandingCols}
              data={(outstanding.data || []).map((r, i) => ({ ...r, id: r.id ?? i }))}
              emptyText="No customer accounts found"
              footerExtra={
                <LedgerBalanceStat
                  label="Total Receivable"
                  value={outstanding.total_outstanding}
                />
              }
            />
          )}
        </>
      )}

      {/* ── OUTSTANDING PAYABLE TAB ──────────────────────────────────────── */}
      {tab === "payable" && (
        <>
          {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner size={28} /></div>}
          {!loading && supplierBal && (
            <DataGrid
             pageSize={8}
              title="Outstanding Payable"
              columns={supplierCols}
              data={(supplierBal.data || []).map((r, i) => ({ ...r, id: r.id ?? i }))}
              emptyText="No supplier accounts found"
              footerExtra={
                <LedgerBalanceStat
                  label="Total Payable"
                  value={supplierBal.total_payable}
                />
              }
            />
          )}
        </>
      )}
    </div>
  );
}