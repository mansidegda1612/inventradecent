import { useEffect, useState } from "react";
import { Card, PageHeader, Field, Btn, ToastProvider, SectionDivider, Badge } from "../components/ui/index";
import { callAPI } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";
import { fmtDate } from "../utils/format";

function daysRemaining(dateStr) {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

const PLAN_STATUS_COLORS = {
  trialing: "#D97706", active: "#1D9E75", past_due: "#D97706",
  canceled: "#E24B4A", expired: "#E24B4A",
};
const PLAN_STATUS_LABELS = {
  trialing: "Trial", active: "Active", past_due: "Past Due",
  canceled: "Canceled", expired: "Expired",
};

export default function AccountSettings({ setPage }) {
  const { subscription } = useAuth();
  const [profile, setProfile] = useState({ name: "", user_id: "", role_name: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await callAPI("account/profile", "GET");
      if (res.success && res.data) {
        setProfile({
          name: res.data.name || "",
          user_id: res.data.user_id || "",
          role_name: res.data.role_name || "",
        });
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await callAPI("account/profile", "PUT", { name: profile.name, user_id: profile.user_id });
      show(res.message, res.success ? "success" : "error");
    } catch {
      show("Error saving profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwErr("");
    if (!currentPassword || !newPassword) { setPwErr("Both fields are required"); return; }
    if (newPassword !== confirmPassword) { setPwErr("New passwords do not match"); return; }
    setPwSaving(true);
    try {
      const res = await callAPI("account/change-password", "PUT", { currentPassword, newPassword });
      if (res.success) {
        show("Password changed");
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      } else {
        setPwErr(res.message || "Could not change password");
      }
    } catch {
      setPwErr("Unable to reach the server. Please try again.");
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) return <p className="u-muted">Loading account details…</p>;

  const trialDays = subscription?.status === "trialing" ? daysRemaining(subscription.trial_ends_at) : null;

  return (
    <div>
      <PageHeader title="Account Settings" sub="Your profile, plan, and security." />

      <Card title="Profile">
        <div className="form-grid-2">
          <Field label="Name" required>
            <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Login ID" required>
            <input value={profile.user_id} onChange={e => setProfile({ ...profile, user_id: e.target.value })} />
          </Field>
        </div>
        {profile.role_name && <p className="u-muted u-fs12">Role: {profile.role_name}</p>}
        <Btn onClick={saveProfile} disabled={saving} style={{ marginTop: 12 }}>
          {saving ? "Saving…" : "Save Profile"}
        </Btn>
      </Card>

      <SectionDivider label="Plan" />
      <Card>
        <div className="account-plan-row">
          <div>
            <div className="account-plan-name">{subscription?.plan?.name || "Trial / Comped access"}</div>
            <div className="u-muted u-fs12">
              {trialDays != null
                ? `Trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}`
                : subscription?.current_period_end
                  ? `Renews ${fmtDate(new Date(subscription.current_period_end))}`
                  : ""}
            </div>
          </div>
          {subscription?.status && (
            <Badge color={PLAN_STATUS_COLORS[subscription.status] || "#6B7280"}>
              {PLAN_STATUS_LABELS[subscription.status] || subscription.status}
            </Badge>
          )}
        </div>
        <Btn variant="ghost" onClick={() => setPage?.("plans")} style={{ marginTop: 12 }}>
          {subscription?.plan ? "Change Plan" : "Upgrade Plan"}
        </Btn>
      </Card>

      <SectionDivider label="Change Password" />
      <Card>
        <Field label="Current Password" required>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </Field>
        <Field label="New Password" required>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </Field>
        <Field label="Confirm New Password" required>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </Field>
        {pwErr && <p className="login-error">{pwErr}</p>}
        <Btn onClick={changePassword} disabled={pwSaving} style={{ marginTop: 8 }}>
          {pwSaving ? "Saving…" : "Change Password"}
        </Btn>
      </Card>

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}
