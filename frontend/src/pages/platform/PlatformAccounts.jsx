// Every customer account, its plan, and where its subscription stands — plus
// the two actions the console exists for: onboard a customer by hand, and
// approve a plan for someone who paid in cash.
import { useRef, useState, useEffect } from "react";
import { Card, PageHeader, DataGrid, StatCard, Badge, ToastProvider } from "../../components/ui";
import { callAPI } from "../../utils/callserver";
import CustomerModal from "./CustomerModal";

const STATUS_COLORS = {
  active:    { label: "Active",   color: "#1D9E75" },
  trialing:  { label: "Trial",    color: "#4F46E5" },
  past_due:  { label: "Past Due", color: "#D97706" },
  expired:   { label: "Expired",  color: "#E24B4A" },
  canceled:  { label: "Canceled", color: "#6B7280" },
};

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
}

// "in 12d" / "6d ago" next to the expiry date — the whole point of this screen
// is spotting who is about to lapse, and a bare date makes you do that maths
// in your head for every row.
function relativeDays(v) {
  if (!v) return null;
  const days = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  if (days === 0) return "today";
  return days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
}

export default function PlatformAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ total: 0, trialing: 0, active: 0, lapsed: 0, paying: 0 });
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const modalRef = useRef(null);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 4000);
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await callAPI("platform/accounts", "GET");
      if (res?.success) {
        setAccounts(res.data.accounts || []);
        setSummary(res.data.summary || {});
        return res.data.accounts;
      }
      show(res?.message || "Could not load accounts", "error");
    } catch {
      show("Could not reach the server", "error");
    } finally {
      setLoading(false);
    }
  };

  // The plan catalog barely changes, so it's fetched once rather than every
  // time the modal opens.
  const fetchPlans = async () => {
    try {
      const res = await callAPI("platform/plans", "GET");
      if (res?.success) setPlans(res.data || []);
    } catch {
      // non-fatal — the modal shows an empty plan list and says so
    }
  };

  // DataGrid runs client-side here (the whole list arrives in one call), so it
  // never auto-calls onFetch — load once on mount, same as UserManagement.
  useEffect(() => { fetchAccounts(); fetchPlans(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="Customers"
        sub="Every account on the platform. Add a customer by hand, or approve a plan for one who paid in cash."
      />

      <div className="pf-stats">
        <StatCard label="Total Accounts" value={summary.total ?? 0} icon="◉" />
        <StatCard label="On Trial" value={summary.trialing ?? 0} color="#4F46E5" bg="#EEF0FF" icon="◷" />
        <StatCard label="Active" value={summary.active ?? 0} color="#1D9E75" bg="#ECFDF5" icon="✓"
          sub={`${summary.paying ?? 0} on a paid plan`} />
        <StatCard label="Lapsed" value={summary.lapsed ?? 0} color="#E24B4A" bg="#FEF2F2" icon="!"
          sub="Expired / past due / canceled" />
      </div>

      <Card noPad>
        <DataGrid
          title=""
          exportFilename="customers.xlsx"
          columns={[
            {
              key: "name", label: "Business",
              render: (v, row) => (
                <div>
                  <div className="u-text u-bold">{v}</div>
                  <div className="u-hint u-fs11">#{row.id}</div>
                </div>
              ),
            },
            {
              key: "owner_name", label: "Owner",
              render: (v, row) => (
                <div>
                  <div className="u-text">{v || <span className="u-hint">—</span>}</div>
                  <div className="u-muted u-fs11">{row.owner_email}</div>
                </div>
              ),
            },
            { key: "owner_phone", label: "Phone", render: v => v || <span className="u-hint">—</span> },
            {
              key: "plan_name", label: "Plan",
              render: (v, row) => v
                ? (
                  <div>
                    <div className="u-text u-bold">{v}</div>
                    <div className="u-hint u-fs11">{row.billing_interval}</div>
                  </div>
                )
                : <span className="u-hint">No plan</span>,
            },
            {
              key: "sub_status", label: "Status",
              render: (v) => {
                const s = STATUS_COLORS[v] || { label: v || "—", color: "#6B7280" };
                return <Badge color={s.color}>{s.label}</Badge>;
              },
            },
            {
              // Whichever date actually governs access for this account: a trial
              // is bounded by trial_ends_at, a paid plan by current_period_end.
              key: "current_period_end", label: "Access Until",
              render: (v, row) => {
                const date = row.sub_status === "trialing" ? row.trial_ends_at : v;
                if (!date) return <span className="u-hint">—</span>;
                const rel = relativeDays(date);
                const late = new Date(date) < new Date();
                return (
                  <div>
                    <div className="u-text">{fmtDate(date)}</div>
                    <div className={`u-fs11 ${late ? "u-red" : "u-muted"}`}>{rel}</div>
                  </div>
                );
              },
            },
            {
              key: "is_manual", label: "Paid Via",
              render: (v, row) => {
                if (!row.plan_id) return <span className="u-hint">—</span>;
                return v
                  ? <span className="u-pill u-pill-accent">Cash / Manual</span>
                  : <span className="u-pill u-pill-blue">Razorpay</span>;
              },
            },
            {
              key: "paid_total", label: "Collected",
              render: v => <span className="u-mono">₹{Number(v || 0).toLocaleString("en-IN")}</span>,
            },
            {
              key: "user_count", label: "Users / Orgs",
              render: (v, row) => <span className="u-muted u-fs12">{v} / {row.org_count}</span>,
            },
            {
              // Latest login by any user on the account — see the query comment.
              key: "last_login", label: "Last Login",
              render: v => v ? fmtDate(v) : <span className="u-hint">Never</span>,
            },
            { key: "created_at", label: "Signed Up", render: v => fmtDate(v) },
          ]}
          data={accounts}
          total={accounts.length}
          loading={loading}
          onFetch={fetchAccounts}
          emptyText="No customer accounts yet"
          HeaderButtons={[
            {
              key: "add", label: "Add Customer", icon: "+", variant: "primary",
              onClick: () => modalRef.current?.openAdd(),
            },
          ]}
          footerButtons={[
            {
              key: "approve", label: "Set Plan / Approve Cash", icon: "✓",
              onClick: (ids, all, focused) => {
                if (!focused) { show("Pick a customer row first", "error"); return; }
                modalRef.current?.openApprove(focused);
              },
            },
          ]}
        />
      </Card>

      <CustomerModal
        ref={modalRef}
        plans={plans}
        onSaved={(msg) => { show(msg); fetchAccounts(); }}
      />
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}
