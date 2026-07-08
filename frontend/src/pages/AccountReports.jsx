import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/theme";
import { fmt, fmtDate, fmtDateShort,fmtDateISO } from "../utils/format";
import { callAPI } from "../utils/callserver";
import {
  Btn, Card, Badge, Field, PageHeader, DateFilter, TableWrap,
  Spinner, DataGrid, Dropdown, BalancePill, Tabs
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
    SI: { label: "Sale", cls: "u-pill-green" },
    PI: { label: "Purchase", cls: "u-pill-blue" },
    CR: { label: "Receipt", cls: "u-pill-green" },   // NEW — Cash/Bank Receipt
    CP: { label: "Payment", cls: "u-pill-blue" }, // NEW — Cash/Bank Payment
  };
  const { label, cls } = map[type] || { label: type, cls: "u-pill-hint" };
  return <span className={`u-pill ${cls}`}>{label}</span>;
}

// ─── ledger balance stat (used in DataGrid headerExtra / footerExtra) ─────────
function LedgerBalanceStat({ label, value, flagDr = "Pay", flagCr = "Rec", size = "normal" }) {
  const n = Number(value) || 0;
  const isDebit = n >= 0;
  const isSmall = size === "small";
  return (
    <div className={`u-statpill ${isSmall ? "u-statpill-small" : ""}`}>
      <span className="u-statpill-label">{label}</span>
      <span className={`u-statpill-value ${isDebit ? "u-statpill-value-pos" : "u-statpill-value-neg"}`}>
        {fmt(Math.abs(n))}
        <span className="u-statpill-flag">
          {isDebit ? flagCr : flagDr}
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
  // "Payable" column  = entries that move the payable side: PI (+) / CP (-)
  // "Receivable" column = entries that move the receivable side: SI (+) / CR (-)
  // (matches the running_balance direction: SI +, PI -, CR -, CP + already
  //  computed on the backend — CP/CR here just show as a reduction on the
  //  side they settle, same two-column ledger layout as before)
  const ledgerCols = [
    {
      key: "date", label: "Date",
      render: v => <span className="u-muted u-fs12">{fmtDateShort(v)}</span>,
    },
    {
      key: "trans_type", label: "Type", sortable: false,
      render: v => <TransBadge type={v} />,
    },
    {
      key: "bill_no", label: "Bill / Voucher No",
      render: v => (
        <span className="u-accent u-fs12 u-bold">
          {v || "—"}
        </span>
      ),
    },
    {
      key: "_debit", label: "Payable",
      sortable: false,
      render: (_, row) => {
        if (row.trans_type === "PI")
          return <span className="u-red u-bold">{fmt(row.final_amount)}</span>;
        if (row.trans_type === "CP")   // NEW — payment reduces payable
          return <span className="u-green u-bold">- {fmt(row.final_amount)}</span>;
        return <span className="u-hint">—</span>;
      },
    },
    {
      key: "_credit", label: "Receivable",
      sortable: false,
      render: (_, row) => {
        if (row.trans_type === "SI")
          return <span className="u-green u-bold">{fmt(row.final_amount)}</span>;
        if (row.trans_type === "CR")   // NEW — receipt reduces receivable
          return <span className="u-red u-bold">- {fmt(row.final_amount)}</span>;
        return <span className="u-hint">—</span>;
      },
    },
    {
      key: "running_balance", label: "Balance",
      render: v => <BalancePill value={v} />,
    },
  ];

  // ── outstanding DataGrid columns ─────────────────────────────────────────
  // period_receipts (CR) is now returned by the backend and subtracted into
  // `outstanding` — shown here as its own column so it's clear why the
  // outstanding figure is lower than opening + sales.
  const outstandingCols = [
    { key: "name", label: "Customer", render: v => <span className="u-text u-bold">{v}</span> },
    { key: "city", label: "City", render: v => <span className="u-muted">{v || "—"}</span> },
    { key: "contact_no", label: "Contact", render: v => <span className="u-muted">{v || "—"}</span> },
    { key: "opening", label: "Opening", render: v => <span>{fmt(v)}</span> },
    { key: "period_sales", label: "Sales", render: v => <span className="u-green u-bold">{fmt(v)}</span> },
    {
      key: "period_receipts", label: "Receipts", // NEW
      render: v => <span className="u-red u-bold">{Number(v) > 0 ? `- ${fmt(v)}` : fmt(v)}</span>,
    },
    { key: "outstanding", label: "Outstanding", render: v => <BalancePill value={v} /> },
  ];

  // ── supplier / payable DataGrid columns ──────────────────────────────────
  // period_payments (CP) is now returned by the backend and subtracted into
  // `payable`, shown here as its own column.
  const supplierCols = [
    { key: "name", label: "Supplier", render: v => <span className="u-text u-bold">{v}</span> },
    { key: "city", label: "City", render: v => <span className="u-muted">{v || "—"}</span> },
    { key: "contact_no", label: "Contact", render: v => <span className="u-muted">{v || "—"}</span> },
    { key: "opening", label: "Opening", render: v => <span>{fmt(Math.abs(v))}</span> },
    { key: "period_purchases", label: "Purchases", render: v => <span className="u-blue u-bold">{fmt(v)}</span> },
    {
      key: "period_payments", label: "Payments", // NEW
      render: v => <span className="u-green u-bold">{Number(v) > 0 ? `- ${fmt(v)}` : fmt(v)}</span>,
    },
    { key: "payable", label: "Payable", render: v => <BalancePill value={v} /> },
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
          <span className="u-accent u-bold-700 u-fs12">◈ Opening Balance</span>
        );
        if (col.key === "running_balance") return <BalancePill value={row.running_balance} />;
        return <span className="u-hint">—</span>;
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
      <div className="ar-tabbar">
        <Tabs tabs={TABS} active={tab} onChange={setTab} variant="pill" />
      </div>

      {/* Error banner */}
      {error && (
        <div className="u-alert-error">
          ⚠️ {error}
        </div>
      )}

      {/* ── LEDGER TAB ───────────────────────────────────────────────────── */}
      {tab === "ledger" && (
        <>
          {loading && <div className="u-center-pad40"><Spinner size={28} /></div>}

          {!loading && (
            <DataGrid
              pageSize={8}
              columns={ledgerColsWithOpening}
              data={ledgerRows ?? []}
              emptyText="Select an account to view transactions"
              headerExtra={
                <div className="ar-ledger-header">
                  <div className="ar-ledger-account">
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
          {loading && <div className="u-center-pad40"><Spinner size={28} /></div>}
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