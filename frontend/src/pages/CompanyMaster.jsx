import { useEffect, useState } from "react";
import { Card, PageHeader, Field, Btn, ToastProvider, SectionDivider } from "../components/ui/index";
import { callAPI, resolveAssetUrl } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";
import { invalidateCompanyCache as invalidateInvoiceCache } from "../utils/GSTInvoicePrinter";
import { invalidateCompanyCache as invalidateWaCache } from "../utils/WhatsAppSender";

const empty = {
  name: "", tagline: "", address: "", city: "", phone: "", email: "", web: "",
  pan: "", gstin: "", logo_url: "",
  bank_name: "", bank_branch: "", bank_acc_number: "", bank_ifsc: "", upi_id: "", account_holder: "",
  terms: [], financial_year_start: "",
};

export default function CompanyMaster() {
  const { hasRight, setCompany: setGlobalCompany } = useAuth();
  const canEdit = hasRight("company.edit");
  const [form, setForm] = useState(empty);
  const [termsText, setTermsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await callAPI("company", "GET");
      if (res.success && res.data) {
        setForm({ ...empty, ...res.data, terms: res.data.terms || [] });
        setTermsText((res.data.terms || []).join("\n"));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const model = {
        ...form,
        terms: termsText.split("\n").map(t => t.trim()).filter(Boolean),
      };
      const res = await callAPI("company", "PUT", model);
      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        setGlobalCompany?.(res.data);
        await load();

        invalidateInvoiceCache();
        invalidateWaCache();
      }
    } catch {
      show("Error saving company details", "error");
    } finally {
      setSaving(false);
    }
  };

  // Uploads immediately on file selection (rather than waiting for the main
  // Save button) so the preview and logo_url update right away.
  const handleLogoPick = async (file) => {
    if (!file) return;
    setLogoFile(file);
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append("logo", file);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}company/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      show(data.message, data.success ? "success" : "error");
      if (data.success) {
        setForm(f => ({ ...f, logo_url: data.data.logo_url }));
      }
    } catch {
      show("Error uploading logo", "error");
    } finally {
      setUploadingLogo(false);
      setLogoFile(null);
    }
  };

  if (loading) return <p className="u-muted">Loading company details…</p>;

  return (
    <div>
      <PageHeader title="Company Settings" sub="These details appear on every printed invoice and WhatsApp bill." />

      {!canEdit && (
        <p className="u-muted u-fs12" style={{ marginBottom: 12 }}>
          You have view-only access. Contact an admin to change these details.
        </p>
      )}

      <Card title="Company Details">
        <div className="form-grid-2">
          <Field label="Company Name" required>
            <input disabled={!canEdit} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <input disabled={!canEdit} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} />
          </Field>
        </div>

        <Field label="Address">
          <input disabled={!canEdit} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        </Field>

        <div className="form-grid-2">
          <Field label="City / State / Pincode">
            <input disabled={!canEdit} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input disabled={!canEdit} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>

        <div className="form-grid-2">
          <Field label="Email">
            <input disabled={!canEdit} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Website">
            <input disabled={!canEdit} value={form.web} onChange={e => setForm({ ...form, web: e.target.value })} />
          </Field>
        </div>

        <div className="form-grid-2">
          <Field label="PAN">
            <input disabled={!canEdit} value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value })} />
          </Field>
          <Field label="GSTIN">
            <input disabled={!canEdit} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} />
          </Field>
        </div>

        <Field label="Logo">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {form.logo_url && (
              <img
                src={resolveAssetUrl(form.logo_url)}
                alt="Company logo"
                style={{ height: 40, borderRadius: 6, border: "1px solid var(--border)" }}
              />
            )}
            {canEdit && (
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={uploadingLogo}
                onChange={e => handleLogoPick(e.target.files?.[0] || null)}
              />
            )}
            {uploadingLogo && <span className="u-muted u-fs12">Uploading…</span>}
          </div>
          <p className="u-muted u-fs12" style={{ marginTop: 6 }}>
            Stored on the backend and served with CORS headers so it still renders correctly
            inside the printed invoice/PDF regardless of which server the frontend is deployed on.
          </p>
        </Field>
      </Card>

      <SectionDivider label="Bank Details" />

      <Card>
        <div className="form-grid-2">
          <Field label="Bank Name">
            <input disabled={!canEdit} value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
          </Field>
          <Field label="Branch">
            <input disabled={!canEdit} value={form.bank_branch} onChange={e => setForm({ ...form, bank_branch: e.target.value })} />
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="Account Number">
            <input disabled={!canEdit} value={form.bank_acc_number} onChange={e => setForm({ ...form, bank_acc_number: e.target.value })} />
          </Field>
          <Field label="IFSC">
            <input disabled={!canEdit} value={form.bank_ifsc} onChange={e => setForm({ ...form, bank_ifsc: e.target.value })} />
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="UPI ID">
            <input disabled={!canEdit} value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} />
          </Field>
          <Field label="Account Holder Name">
            <input disabled={!canEdit} value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} />
          </Field>
        </div>
      </Card>

      <SectionDivider label="Invoice Terms" />

      <Card>
        <Field label="One term per line — printed at the bottom of every invoice">
          <textarea
            disabled={!canEdit}
            rows={4}
            value={termsText}
            onChange={e => setTermsText(e.target.value)}
            style={{ width: "100%", fontFamily: "inherit" }}
          />
        </Field>
      </Card>

      {canEdit && (
        <div className="u-modal-footer-actions" style={{ marginTop: 16 }}>
          <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Company Details"}</Btn>
        </div>
      )}

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}