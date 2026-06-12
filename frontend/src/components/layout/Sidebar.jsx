import { useState } from "react";
import { C } from "../../utils/theme";

const NAV = [
  { id: "dashboard",   label: "Dashboard",         icon: "⊞", roles: [1, 2] },
  { section: "Masters",                                        roles: [1, 2] },
  { id: "accounts",    label: "Account Master",    icon: "◉", roles: [1, 2]  },
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

function SidebarContent({ page, setPage, role, onLogout, onClose, expanded, onToggle }) {
  const handleNav = (id) => {
    setPage(id);
    onClose?.();
  };

  return (
    <div style={{
      width: expanded ? 230 : 60,
      height: "100%",
      minHeight: "100vh",
      background: C.sidebarBg,
      borderRight: `1px solid ${C.sidebarBorder}`,
      display: "flex",
      flexDirection: "column",
      transition: "width .22s cubic-bezier(.4,0,.2,1)",
      overflow: "hidden",
    }}>

      {/* Logo + toggle */}
      <div style={{
        padding: expanded ? "22px 20px 16px" : "22px 0 16px",
        borderBottom: `1px solid ${C.sidebarBorder}`,
        display: "flex",
        alignItems: "center",
        justifyContent: expanded ? "space-between" : "center",
        minHeight: 64,
        flexShrink: 0,
      }}>
        {expanded && (
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: "#fff", letterSpacing: "-.03em", whiteSpace: "nowrap" }}>
              <span style={{ color: "#818CF8" }}>Inventra</span>Decent
            </div>
            <div style={{ fontSize: 10, color: C.sidebarText, marginTop: 2, opacity: 0.7 }}>
              Accounting & Inventory
            </div>
          </div>
        )}

        {/* Toggle / hamburger button */}
        <button
          onClick={onToggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            background: "#2D2B5E",
            border: "none",
            color: C.sidebarText,
            width: 30,
            height: 30,
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background .5s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#4F46E5")}
          onMouseLeave={e => (e.currentTarget.style.background = "#2D2B5E")}
        >
          {expanded ? "←" : "→"}
        </button>

        {/* Mobile close */}
        {onClose && expanded && (
          <button
            onClick={onClose}
            style={{ background: "#2D2B5E", border: "none", color: C.sidebarText, width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
          >×</button>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: expanded ? "8px 10px" : "8px 6px" }}>
        {NAV.filter(n => !n.roles || n.roles.includes(role)).map((n, i) => {
          if (n.section) {
            // In collapsed mode: render a thin divider instead of section label
            if (!expanded) {
              return (
                <div key={i} style={{
                  height: 1,
                  background: C.sidebarBorder,
                  margin: "8px 6px",
                  opacity: 0.5,
                }} />
              );
            }
            return (
              <div key={i} style={{
                fontSize: 10, fontWeight: 700, color: "#6366F1",
                letterSpacing: ".1em", textTransform: "uppercase",
                padding: "13px 12px 4px", opacity: 0.85,
                whiteSpace: "nowrap",
              }}>
                {n.section}
              </div>
            );
          }

          const active = page === n.id;
          return (
            <div
              key={n.id}
              style={{ position: "relative" }}
              className="sidebar-nav-item"
            >
              <button
                onClick={() => handleNav(n.id)}
                title={!expanded ? n.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: expanded ? 10 : 0,
                  width: "100%",
                  padding: expanded ? "9px 12px" : "10px 0",
                  justifyContent: expanded ? "flex-start" : "center",
                  borderRadius: 8,
                  background: active ? "#4F46E5" : "transparent",
                  color: active ? "#fff" : C.sidebarText,
                  border: "none",
                  fontWeight: active ? 600 : 500,
                  fontSize: 13,
                  textAlign: "left",
                  transition: "all .5s",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
                onMouseEnter={e => !active && (e.currentTarget.style.background = "#2D2B5E")}
                onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}
              >
                <span style={{
                  fontSize: 16,
                  width: 20,
                  textAlign: "center",
                  flexShrink: 0,
                  opacity: active ? 1 : 0.75,
                }}>
                  {n.icon}
                </span>
                {expanded && (
                  <span style={{ opacity: expanded ? 1 : 0, transition: "opacity .5s" }}>
                    {n.label}
                  </span>
                )}
              </button>

              {/* Tooltip on collapsed hover */}
              {!expanded && (
                <span style={{
                  position: "absolute",
                  left: "calc(100% + 10px)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "#1e1b4b",
                  color: "#e0e0f0",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 7,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  opacity: 0,
                  transition: "opacity .5s",
                  zIndex: 999,
                  boxShadow: "0 4px 14px #00000030",
                  border: "1px solid #3730a3",
                  // show via CSS group hover — injected below
                }} className="sidebar-tooltip">
                  {n.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sign out */}
      <div style={{ padding: expanded ? "14px" : "14px 6px", borderTop: `1px solid ${C.sidebarBorder}` }}>
        <button
          onClick={onLogout}
          title={!expanded ? "Sign Out" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: expanded ? "flex-start" : "center",
            gap: expanded ? 8 : 0,
            width: "100%",
            background: "transparent",
            border: "none",
            color: C.sidebarText,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
            opacity: 0.7,
            padding: expanded ? 0 : "6px 0",
            borderRadius: 8,
            transition: "all .5s",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "#2D2B5E"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ fontSize: 16 }}>⇥</span>
          {expanded && "Sign Out"}
        </button>
      </div>

      {/* Tooltip CSS */}
      <style>{`
        .sidebar-nav-item:hover .sidebar-tooltip { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

export default function Sidebar({ page, setPage, role, onLogout, mobileOpen, setMobileOpen }) {
  const [expanded, setExpanded] = useState(false); // collapsed by default

  return (
    <>
      {/* Desktop sidebar */}
      <div className="sidebar-desktop">
        <SidebarContent
          page={page}
          setPage={setPage}
          role={role}
          onLogout={onLogout}
          expanded={expanded}
          onToggle={() => setExpanded(e => !e)}
        />
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
          expanded={true} // always expanded in mobile drawer
          onToggle={() => {}}
        />
      </div>
    </>
  );
}