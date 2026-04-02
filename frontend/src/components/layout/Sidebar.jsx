import { C } from "../../utils/theme";

const NAV = [
  { id: "dashboard",   label: "Dashboard",         icon: "⊞", roles: [1, 2] },
  { section: "Masters",                                        roles: [1, 2] },
  { id: "accounts",    label: "Account Master",    icon: "◉", roles: [1, 2]  },
  { id: "categories",  label: "Category Master",   icon: "▤", roles: [1, 2]  },
  { id: "products",    label: "Product Master",    icon: "⬡", roles: [1, 2]  },
  { id: "barcode",     label: "Barcode Generator", icon: "▦", roles: [1, 2]  },
  { section: "Transactions",                                   roles: [1, 2]  },
  { id: "purchase",    label: "Purchase Entry",    icon: "↓", roles: [1, 2]  },
  { id: "sale",        label: "Sale Entry",        icon: "↑", roles: [1, 2]  },
  { section: "Reports",                                        roles: [1, 2]  },
  { id: "inv-reports", label: "Inventory Reports", icon: "◑", roles: [1, 2]  },
  { id: "acc-reports", label: "Account Reports",   icon: "≡", roles: [1, 2]  },
  { id: "fin-reports", label: "Financial Reports", icon: "◈", roles: [1, 2]  },
  { section: "Admin",                                          roles: [1] },
  { id: "users",       label: "User Management",   icon: "⊙", roles:  [1] },
];

function SidebarContent({ page, setPage, role, onLogout, onClose }) {
  const handleNav = (id) => {
    setPage(id);
    onClose?.();
  };

  return (
    <div style={{
      width: 230, height: "100%", minHeight: "100vh",
      background: C.sidebarBg,
      borderRight: `1px solid ${C.sidebarBorder}`,
      display: "flex", flexDirection: "column",
    }}>
      {/* Logo */}
      <div style={{ padding: "22px 20px 16px", borderBottom: `1px solid ${C.sidebarBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "#fff", letterSpacing: "-.03em" }}>
            <span style={{ color: "#818CF8" }}>Inventra</span>Decent
          </div>
          <div style={{ fontSize: 10, color: C.sidebarText, marginTop: 2, opacity: 0.7 }}>
            Accounting & Inventory
          </div>
        </div>
        {/* Mobile close btn */}
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "#2D2B5E", border: "none", color: C.sidebarText, width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </button>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {NAV.filter(n => !n.roles || n.roles.includes(role)).map((n, i) => {
          if (n.section) {
            return (
              <div key={i} style={{
                fontSize: 10, fontWeight: 700, color: "#6366F1",
                letterSpacing: ".1em", textTransform: "uppercase",
                padding: "13px 12px 4px", opacity: 0.85,
              }}>
                {n.section}
              </div>
            );
          }
          const active = page === n.id;
          return (
            <button
              key={n.id}
              onClick={() => handleNav(n.id)}
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

export default function Sidebar({ page, setPage, role, onLogout, mobileOpen, setMobileOpen }) {
  return (
    <>
      {/* Desktop sidebar — hidden on mobile via CSS class */}
      <div className="sidebar-desktop">
        <SidebarContent page={page} setPage={setPage} role={role} onLogout={onLogout} />
      </div>

      {/* Mobile drawer */}
      <div
        className="sidebar-overlay"
        style={{ opacity: mobileOpen ? 1 : 0, pointerEvents: mobileOpen ? "auto" : "none", transition: "opacity .25s" }}
        onClick={() => setMobileOpen(false)}
      />
      <div className={`sidebar-drawer${mobileOpen ? " open" : ""}`}>
        <SidebarContent
          page={page}
          setPage={setPage}
          role={role}
          onLogout={onLogout}
          onClose={() => setMobileOpen(false)}
        />
      </div>
    </>
  );
}
