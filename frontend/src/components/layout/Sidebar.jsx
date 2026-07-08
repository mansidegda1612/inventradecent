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
   { id: "cash-receipt", label: "Cash/Bank Receipt", icon: "⤓", roles: [1, 2]  },  // NEW
  { id: "cash-payment", label: "Cash/Bank Payment", icon: "⤒", roles: [1, 2]  },  // NEW
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
    <div className={`sb-root ${expanded ? "sb-expanded" : "sb-collapsed"}`}>

      {/* Logo + toggle */}
      <div className="sb-header">
        {expanded && (
          <div>
            <div className="sb-brand">
              <span className="sb-brand-highlight">Inventra</span>Decent
            </div>
            <div className="sb-subtitle">
              Accounting & Inventory
            </div>
          </div>
        )}

        {/* Toggle / hamburger button */}
        <button
          onClick={onToggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="sb-toggle-btn"
        >
          {expanded ? "←" : "→"}
        </button>

        {/* Mobile close */}
        {onClose && expanded && (
          <button onClick={onClose} className="sb-close-btn">×</button>
        )}
      </div>

      {/* Nav */}
      <div className="sb-nav">
        {NAV.filter(n => !n.roles || n.roles.includes(role)).map((n, i) => {
          if (n.section) {
            // In collapsed mode: render a thin divider instead of section label
            if (!expanded) {
              return <div key={i} className="sb-section-divider" />;
            }
            return (
              <div key={i} className="sb-section-label">
                {n.section}
              </div>
            );
          }

          const active = page === n.id;
          return (
            <div key={n.id} className="sidebar-nav-item sb-nav-item">
              <button
                onClick={() => handleNav(n.id)}
                title={!expanded ? n.label : undefined}
                className={`sb-nav-btn ${active ? "sb-nav-btn-active" : ""}`}
              >
                <span className={`sb-nav-icon ${active ? "sb-nav-icon-active" : ""}`}>
                  {n.icon}
                </span>
                {expanded && (
                  <span className="sb-nav-label">
                    {n.label}
                  </span>
                )}
              </button>

              {/* Tooltip on collapsed hover */}
              {!expanded && (
                <span className="sidebar-tooltip sb-tooltip">
                  {n.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sign out */}
      <div className="sb-signout-wrap">
        <button
          onClick={onLogout}
          title={!expanded ? "Sign Out" : undefined}
          className="sb-signout-btn"
        >
          <span className="sb-signout-icon">⇥</span>
          {expanded && "Sign Out"}
        </button>
      </div>
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
        className={`sidebar-overlay ${mobileOpen ? "sidebar-overlay-open" : ""}`}
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