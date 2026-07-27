// One modal, two jobs, because the subscription half is identical in both:
//
//   openAdd()            — create a brand new customer (account + owner login +
//                          first organization + subscription), the by-hand
//                          equivalent of a self-service signup
//   openApprove(account) — set/renew the plan on an existing account, which is
//                          the cash-approval flow: pick the plan, pick the end
//                          date, record what they handed over
import { useState, forwardRef, useImperativeHandle } from "react";
import { Modal, Btn, Field, PasswordInput, Dropdown, SectionDivider } from "../../components/ui";
import { callAPI } from "../../utils/callserver";

const METHODS = [
  { id: "cash", name: "Cash" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "upi", name: "UPI" },
  { id: "cheque", name: "Cheque" },
  { id: "other", name: "Other" },
];

const DEFAULT_TRIAL_DAYS = 14;

function toISO(d) {
  // Local calendar date, not UTC — toISOString() would roll back a day for any
  // timezone east of Greenwich, which is every user of this app.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() {
  return toISO(new Date());
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

// A year bought on 25 Jul 2026 runs *through* 24 Jul 2027 — one day short of the
// anniversary, not up to it, or every renewal would overlap by a day.
function periodEndFor(startStr, interval) {
  const d = new Date(`${startStr}T00:00:00`);
  if (interval === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return toISO(d);
}

const blankForm = () => ({
  // new-customer fields (add mode only)
  business_name: "", name: "", email: "", phone: "", password: "",
  send_welcome_email: true,
  // subscription
  mode: "paid",                       // "paid" | "trial"
  plan_id: null,
  period_start: today(),
  period_end: "",
  trial_ends_at: addDays(today(), DEFAULT_TRIAL_DAYS),
  // money received
  record_payment: true,
  amount_inr: "",
  method: "cash",
  reference: "",
  note: "",
});

const CustomerModal = forwardRef(function CustomerModal({ plans = [], onSaved }, ref) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("add");       // "add" | "approve"
  const [account, setAccount] = useState(null);  // approve mode: the row clicked
  const [f, setF] = useState(blankForm);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  useImperativeHandle(ref, () => ({
    openAdd() {
      setMode("add"); setAccount(null); setF(blankForm()); setErr(""); setOpen(true);
    },
    openApprove(row) {
      setMode("approve");
      setAccount(row);
      // Pre-fill from what the account already has: renewing normally means the
      // same plan again, starting the day after the current period ends.
      const start = row.current_period_end && new Date(row.current_period_end) > new Date()
        ? addDays(toISO(new Date(row.current_period_end)), 1)
        : today();
      setF({ ...blankForm(), plan_id: row.plan_id || null, period_start: start });
      setErr("");
      setOpen(true);
    },
  }));

  const selectedPlan = plans.find((p) => String(p.id) === String(f.plan_id)) || null;

  // Picking a plan (re)derives the end date and the amount from that plan, but
  // both stay editable — a cash deal might be discounted or run to an odd date.
  const pickPlan = (planId) => {
    const plan = plans.find((p) => String(p.id) === String(planId));
    set({
      plan_id: planId,
      period_end: plan ? periodEndFor(f.period_start, plan.billing_interval) : "",
      amount_inr: plan ? String(plan.price_inr) : "",
    });
  };

  const changeStart = (value) => {
    set({
      period_start: value,
      period_end: selectedPlan && value ? periodEndFor(value, selectedPlan.billing_interval) : f.period_end,
    });
  };

  const validate = () => {
    if (mode === "add") {
      if (!f.business_name.trim()) return "Business name is required";
      if (!f.name.trim()) return "Owner name is required";
      if (!f.email.trim()) return "Email is required";
      if (!f.phone.trim()) return "Phone number is required";
      if (f.password.length < 6) return "Password must be at least 6 characters";
    }
    if (f.mode === "trial") {
      if (!f.trial_ends_at) return "Pick a trial end date";
      return null;
    }
    if (!f.plan_id) return "Pick a plan";
    if (!f.period_start) return "Pick a start date";
    if (!f.period_end) return "Pick an end date";
    if (new Date(f.period_end) < new Date(f.period_start)) return "End date cannot be before the start date";
    if (f.record_payment && !(Number(f.amount_inr) > 0)) return "Enter the amount received";
    return null;
  };

  const submit = async (forceOverride = false) => {
    const problem = validate();
    if (problem) { setErr(problem); return; }

    const payment = f.mode === "paid" && f.record_payment
      ? {
          amount_inr: Number(f.amount_inr),
          method: f.method,
          reference: f.reference.trim() || null,
          note: f.note.trim() || null,
          paid_at: today(),
        }
      : null;

    const body = {
      mode: f.mode,
      ...(f.mode === "trial"
        ? { trial_ends_at: f.trial_ends_at }
        : { plan_id: f.plan_id, period_start: f.period_start, period_end: f.period_end }),
      payment,
      note: f.note.trim() || null,
      ...(forceOverride ? { force_override: true } : {}),
      ...(mode === "add"
        ? {
            business_name: f.business_name.trim(),
            name: f.name.trim(),
            email: f.email.trim(),
            phone: f.phone.trim(),
            password: f.password,
            send_welcome_email: f.send_welcome_email,
          }
        : {}),
    };

    const url = mode === "add" ? "platform/accounts" : `platform/accounts/${account.id}/subscription`;

    setErr(""); setSaving(true);
    try {
      const res = await callAPI(url, "POST", body);
      if (res?.success) {
        setOpen(false);
        onSaved?.(res.message || "Saved");
        return;
      }
      // The account still has a live Razorpay subscription — overwriting it
      // would leave Razorpay auto-charging the customer on a schedule this row
      // no longer describes, so the server refuses until it's confirmed.
      if (res?.code === "RAZORPAY_SUBSCRIPTION_ACTIVE") {
        if (window.confirm(`${res.message}\n\nOverride anyway?`)) return submit(true);
        setErr("Cancelled — nothing was changed.");
        return;
      }
      setErr(res?.message || "Could not save");
    } catch {
      setErr("Could not reach the server");
    } finally {
      setSaving(false);
    }
  };

  const planOptions = plans.map((p) => ({
    id: p.id,
    name: `${p.name} — ₹${Number(p.price_inr).toLocaleString("en-IN")} / ${p.billing_interval === "yearly" ? "year" : "month"}`,
    sub: `${p.max_users} user(s), ${p.max_orgs} org(s)`,
  }));

  return (
    <Modal
      open={open}
      onClose={() => !saving && setOpen(false)}
      title={mode === "add" ? "Add Customer" : `Set Plan — ${account?.name || ""}`}
      width={620}
    >
      {mode === "add" && (
        <>
          <SectionDivider label="Business & Login" />
          <Field label="Business Name" required>
            <input value={f.business_name} onChange={(e) => set({ business_name: e.target.value })} autoFocus />
          </Field>
          <div className="pf-form-row">
            <Field label="Owner Name" required>
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Phone" required>
              <input value={f.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" />
            </Field>
          </div>
          <div className="pf-form-row">
            <Field label="Email (this is their login id)" required>
              <input value={f.email} onChange={(e) => set({ email: e.target.value })} type="email" />
            </Field>
            <Field label="Temporary Password" required>
              <PasswordInput value={f.password} onChange={(e) => set({ password: e.target.value })} />
            </Field>
          </div>
          <label className="pf-check">
            <input
              type="checkbox"
              checked={f.send_welcome_email}
              onChange={(e) => set({ send_welcome_email: e.target.checked })}
            />
            Email them their login details
          </label>
        </>
      )}

      <SectionDivider label="Subscription" />

      <div className="pf-toggle">
        <button
          type="button"
          className={`pf-toggle-btn ${f.mode === "paid" ? "pf-toggle-btn-active" : ""}`}
          onClick={() => set({ mode: "paid" })}
        >
          Paid Plan
        </button>
        <button
          type="button"
          className={`pf-toggle-btn ${f.mode === "trial" ? "pf-toggle-btn-active" : ""}`}
          onClick={() => set({ mode: "trial" })}
        >
          Free Trial
        </button>
      </div>

      {f.mode === "trial" ? (
        <Field label="Trial ends on" required>
          <input type="date" value={f.trial_ends_at} onChange={(e) => set({ trial_ends_at: e.target.value })} />
        </Field>
      ) : (
        <>
          <Field label="Plan" required>
            {plans.length
              ? <Dropdown options={planOptions} value={f.plan_id} onChange={pickPlan} placeholder="Select a plan…" />
              : <p className="u-hint u-fs12">No active plans found — run <code>node scripts/seed-plans.js</code> first.</p>}
          </Field>
          <div className="pf-form-row">
            <Field label="Starts on" required>
              <input type="date" value={f.period_start} onChange={(e) => changeStart(e.target.value)} />
            </Field>
            <Field label="Ends on (access until)" required>
              <input type="date" value={f.period_end} onChange={(e) => set({ period_end: e.target.value })} />
            </Field>
          </div>
          <p className="u-hint u-fs11 pf-note">
            Filled in from the plan's billing period — change it to whatever you actually agreed.
            They keep full access through the whole of this day, then drop to read-only.
          </p>

          <SectionDivider label="Payment Received" />
          <label className="pf-check">
            <input
              type="checkbox"
              checked={f.record_payment}
              onChange={(e) => set({ record_payment: e.target.checked })}
            />
            Record money received (leave off to comp this account)
          </label>

          {f.record_payment && (
            <>
              <div className="pf-form-row">
                <Field label="Amount (₹)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={f.amount_inr}
                    onChange={(e) => set({ amount_inr: e.target.value })}
                  />
                </Field>
                <Field label="Method" required>
                  <Dropdown
                    options={METHODS}
                    value={f.method}
                    onChange={(v) => set({ method: v })}
                    allowSearch={false}
                  />
                </Field>
              </div>
              <Field label="Reference (cheque no. / UTR / who collected it)">
                <input value={f.reference} onChange={(e) => set({ reference: e.target.value })} />
              </Field>
            </>
          )}
        </>
      )}

      <Field label="Note (kept on the audit record)">
        <input value={f.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      {err && <p className="u-alert-error pf-err">{err}</p>}

      {selectedPlan && f.mode === "paid" && (
        <p className="pf-summary">
          {mode === "add" ? f.business_name || "This customer" : account?.name} gets <b>{selectedPlan.name}</b>
          {" "}until <b>{f.period_end || "—"}</b>
          {f.record_payment && Number(f.amount_inr) > 0
            ? <> against <b>₹{Number(f.amount_inr).toLocaleString("en-IN")}</b> received by {METHODS.find(m => m.id === f.method)?.name.toLowerCase()}</>
            : <> (no payment recorded)</>}.
        </p>
      )}

      <div className="pf-modal-actions">
        <Btn variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Btn>
        <Btn onClick={() => submit(false)} disabled={saving}>
          {saving ? "Saving…" : mode === "add" ? "Create Customer" : "Approve"}
        </Btn>
      </div>
    </Modal>
  );
});

export default CustomerModal;
