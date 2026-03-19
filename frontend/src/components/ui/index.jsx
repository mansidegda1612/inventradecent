import { C } from "../../utils/theme";

// ─── BUTTON ──────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", small, danger, style: s, disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: small ? "5px 13px" : "8px 18px",
    borderRadius: 8, fontWeight: 600, fontSize: small ? 12 : 13,
    transition: "all .15s", whiteSpace: "nowrap", border: "none",
    opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto",
  };
  const styles = {
    primary: { background: C.accent, color: "#fff", boxShadow: "0 1px 4px " + C.accent + "44" },
    ghost:   { background: "transparent", color: C.muted, border: `1.5px solid ${C.border}` },
    danger:  { background: C.redBg, color: C.red, border: `1.5px solid ${C.red}33` },
    success: { background: C.greenBg, color: C.green, border: `1.5px solid ${C.green}44` },
  };
  const v = danger ? "danger" : variant;
  return (
    <button
      style={{ ...base, ...styles[v], ...s }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.filter = "brightness(.94)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {children}
    </button>
  );
}

// ─── CARD ────────────────────────────────────────────────────────────────────
export function Card({ children, style: s, title, action }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: "0 1px 6px #00000008", ...s }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
          {action}
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
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
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px 22px", boxShadow: "0 1px 6px #00000008" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: C.hint, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</span>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.hint, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#00000040", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, width: "100%", maxWidth: width, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px #00000020" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{title}</span>
          <button onClick={onClose} style={{ background: C.bg, border: "none", color: C.muted, fontSize: 18, lineHeight: 1, width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}>×</button>
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
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-.02em" }}>{title}</h1>
        {sub && <p style={{ color: C.muted, marginTop: 3, fontSize: 13 }}>{sub}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
