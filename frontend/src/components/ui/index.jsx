import { C } from "../../utils/theme";

// ─── BUTTON ──────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", small, danger, style: s, disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: small ? "5px 13px" : "8px 18px",
    borderRadius: 9, fontWeight: 600, fontSize: small ? 12 : 13,
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
            const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
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
