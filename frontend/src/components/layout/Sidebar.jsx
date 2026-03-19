import { C } from "../../utils/theme";

const NAV = [
  { id: "dashboard",   label: "Dashboard",         icon: "⊞", roles: ["admin", "user"] },
  { section: "Masters",                                        roles: ["admin", "user"] },
  { id: "accounts",    label: "Account Master",    icon: "◉", roles: ["admin", "user"] },
  { id: "categories",  label: "Category Master",   icon: "▤", roles: ["admin", "user"] },
  { id: "products",    label: "Product Master",    icon: "⬡", roles: ["admin", "user"] },
  { id: "barcode",     label: "Barcode Generator", icon: "▦", roles: ["admin", "user"] },
  { section: "Transactions",                                   roles: ["admin", "user"] },
  { id: "purchase",    label: "Purchase Entry",    icon: "↓", roles: ["admin", "user"] },
  { id: "sale",        label: "Sale Entry",        icon: "↑", roles: ["admin", "user"] },
  { section: "Reports",                                        roles: ["admin", "user"] },
  { id: "inv-reports", label: "Inventory Reports", icon: "◑", roles: ["admin", "user"] },
  { id: "acc-reports", label: "Account Reports",   icon: "≡", roles: ["admin", "user"] },
  { id: "fin-reports", label: "Financial Reports", icon: "◈", roles: ["admin", "user"] },
  { section: "Admin",                                          roles: ["admin"] },
  { id: "users",       label: "User Management",   icon: "⊙", roles: ["admin"] },
];

export default function Sidebar({ page, setPage, role, onLogout }) {
  return (
    <div style={{
      width: 230, minHeight: "100vh",
      background: C.sidebarBg,
      borderRight: `1px solid ${C.sidebarBorder}`,
      display: "flex", flexDirection: "column", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-.03em" }}>
          <span style={{ color: "#818CF8" }}>Inventra</span>Decent
        </div>
        <div style={{ fontSize: 11, color: C.sidebarText, marginTop: 3, opacity: 0.7 }}>
          Accounting & Inventory
        </div>
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        {NAV.filter(n => !n.roles || n.roles.includes(role)).map((n, i) => {
          if (n.section) {
            return (
              <div key={i} style={{
                fontSize: 10, fontWeight: 700, color: "#6366F1",
                letterSpacing: ".1em", textTransform: "uppercase",
                padding: "14px 12px 5px", opacity: 0.85,
              }}>
                {n.section}
              </div>
            );
          }
          const active = page === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "9px 12px", borderRadius: 8,
                background: active ? "#4F46E5" : "transparent",
                color: active ? "#fff" : C.sidebarText,
                border: "none", fontWeight: active ? 600 : 500,
                fontSize: 13, textAlign: "left",
                transition: "all .15s", cursor: "pointer",
              }}
              onMouseEnter={e => !active && (e.currentTarget.style.background = "#2D2B5E")}
              onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 15, width: 20, textAlign: "center", opacity: active ? 1 : 0.7 }}>
                {n.icon}
              </span>
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Sign out */}
      <div style={{ padding: "14px", borderTop: `1px solid ${C.sidebarBorder}` }}>
        <button
          onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "transparent", border: "none",
            color: C.sidebarText, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
            fontWeight: 500, opacity: 0.7,
          }}
        >
          <span>⇥</span> Sign Out
        </button>
      </div>
    </div>
  );
}
