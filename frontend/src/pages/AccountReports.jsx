import { useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Field, PageHeader, DateFilter, TableWrap } from "../components/ui";

function defaultFrom() { return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10); }
function defaultTo()   { return new Date().toISOString().slice(0, 10); }

export default function AccountReports({ accounts, sales, purchases }) {
  const [tab, setTab]     = useState("ledger");
  const [selAcc, setSelAcc] = useState(accounts[0]?.id || null);
  const [from, setFrom]   = useState(defaultFrom);
  const [to, setTo]       = useState(defaultTo);

  // Filtered by date
  const filteredSales     = sales.filter(s => s.date >= from && s.date <= to);
  const filteredPurchases = purchases.filter(p => p.date >= from && p.date <= to);

  const acc  = accounts.find(a => a.id === Number(selAcc));
  const txns = acc
    ? [
        ...filteredSales.filter(s => s.customerId === acc.id).map(s => ({ ...s, type: "Sale",     amount: s.total })),
        ...filteredPurchases.filter(p => p.supplierId === acc.id).map(p => ({ ...p, type: "Purchase", amount: p.total })),
      ].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];

  const balance = acc
    ? acc.opening + txns.reduce((a, t) => a + (t.type === "Sale" ? t.amount : -t.amount), 0)
    : 0;

  // Outstanding totals
  const totalOutstanding = accounts
    .filter(a => a.type === "customer")
    .reduce((sum, a) => sum + a.opening + filteredSales.filter(s => s.customerId === a.id).reduce((s2, s) => s2 + s.total, 0), 0);

  const totalPayable = accounts
    .filter(a => a.type === "supplier")
    .reduce((sum, a) => sum + a.opening + filteredPurchases.filter(p => p.supplierId === a.id).reduce((s2, p) => s2 + p.total, 0), 0);

  return (
    <div>
      <PageHeader title="Account Reports" sub="Ledger, outstanding balances and account analysis." />

      {/* Date filter */}
      <DateFilter
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        totalLabel={tab === "outstanding" ? "Total Outstanding" : tab === "balance" ? "Total Payable" : "Period"}
        totalValue={tab === "outstanding" ? fmt(totalOutstanding) : tab === "balance" ? fmt(totalPayable) : undefined}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["ledger", "Ledger"], ["outstanding", "Outstanding"], ["balance", "Supplier Balance"]].map(([id, label]) => (
          <Btn key={id} small variant={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>{label}</Btn>
        ))}
      </div>

      {/* LEDGER */}
      {tab === "ledger" && (
        <>
          <div style={{ marginBottom: 16, maxWidth: 340 }}>
            <Field label="Select Account">
              <select value={selAcc || ""} onChange={e => setSelAcc(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </Field>
          </div>
          {acc && (
            <Card title={`Ledger: ${acc.name}`} noPad>
              <TableWrap>
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Ref No</th><th>Debit</th><th>Credit</th></tr></thead>
                  <tbody>
                    <tr>
                      <td colSpan={3} style={{ color: C.hint }}>Opening Balance</td>
                      <td></td>
                      <td style={{ fontWeight: 600 }}>{fmt(acc.opening)}</td>
                    </tr>
                    {txns.map((t, i) => (
                      <tr key={i}>
                        <td style={{ color: C.hint }}>{t.date}</td>
                        <td><Badge color={t.type === "Sale" ? C.green : C.blue}>{t.type}</Badge></td>
                        <td className="mono" style={{ fontSize: 12, color: C.accent }}>{t.invoiceNo || t.billNo}</td>
                        <td style={{ color: C.red, fontWeight: 600 }}>{t.type === "Purchase" ? fmt(t.amount) : "—"}</td>
                        <td style={{ color: C.green, fontWeight: 600 }}>{t.type === "Sale" ? fmt(t.amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <div style={{ textAlign: "right", padding: "12px 20px", borderTop: `2px solid ${C.accent}22`, fontWeight: 700 }}>
                Closing Balance:{" "}
                <span style={{ color: balance >= 0 ? C.green : C.red }}>
                  {fmt(Math.abs(balance))} {balance >= 0 ? "Dr" : "Cr"}
                </span>
              </div>
            </Card>
          )}
        </>
      )}

      {/* OUTSTANDING */}
      {tab === "outstanding" && (
        <Card title="Customer Outstanding" noPad>
          <TableWrap>
            <table>
              <thead><tr><th>Customer</th><th>City</th><th>Opening</th><th>Sales</th><th>Outstanding</th></tr></thead>
              <tbody>
                {accounts.filter(a => a.type === "customer").map(a => {
                  const totalSales  = filteredSales.filter(s => s.customerId === a.id).reduce((sum, s) => sum + s.total, 0);
                  const outstanding = a.opening + totalSales;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: C.text }}>{a.name}</td>
                      <td style={{ color: C.muted }}>{a.city}</td>
                      <td>{fmt(a.opening)}</td>
                      <td style={{ color: C.green, fontWeight: 600 }}>{fmt(totalSales)}</td>
                      <td style={{ fontWeight: 700, color: outstanding > 0 ? C.red : C.green }}>{fmt(outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      {/* SUPPLIER BALANCE */}
      {tab === "balance" && (
        <Card title="Supplier Balance" noPad>
          <TableWrap>
            <table>
              <thead><tr><th>Supplier</th><th>City</th><th>Opening</th><th>Purchases</th><th>Payable</th></tr></thead>
              <tbody>
                {accounts.filter(a => a.type === "supplier").map(a => {
                  const totalPurch = filteredPurchases.filter(p => p.supplierId === a.id).reduce((sum, p) => sum + p.total, 0);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: C.text }}>{a.name}</td>
                      <td style={{ color: C.muted }}>{a.city}</td>
                      <td>{fmt(a.opening)}</td>
                      <td style={{ color: C.blue, fontWeight: 600 }}>{fmt(totalPurch)}</td>
                      <td style={{ fontWeight: 700, color: C.amber }}>{fmt(a.opening + totalPurch)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
