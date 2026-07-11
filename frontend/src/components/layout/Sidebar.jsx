import { useState } from "react";
import { C } from "../../utils/theme";
import { useAuth } from "../../context/AuthContext";

// Each item now declares the right(s) needed to see it. `rights: [...]`
// means "any of these" — used for sections that map to several actions.
const NAV = [
  { id: "dashboard",   label: "Dashboard",         icon: "⊞", right: "dashboard.view" },
  { section: "Masters", right: "accounts.view" },
  { id: "accounts",    label: "Account Master",    icon: "◉", right: "accounts.view" },
  { id: "products",    label: "Product Master",    icon: "⬡", right: "products.view" },
  { id: "barcode",     label: "Barcode Generator", icon: "▦", right: "barcode.generate" },
  { section: "Transactions", rights: ["purchase.view", "sale.view", "cash_receipt.view", "cash_payment.view"] },
  { id: "purchase",    label: "Purchase Entry",    icon: "↓", right: "purchase.view" },
  { id: "sale",        label: "Sale Entry",        icon: "↑", right: "sale.view" },
  { id: "cash-receipt", label: "Cash/Bank Receipt", icon: "⤓", right: "cash_receipt.view" },
  { id: "cash-payment", label: "Cash/Bank Payment", icon: "⤒", right: "cash_payment.view" },
  { section: "Reports", rights: ["reports.inventory", "reports.account", "reports.financial"] },
  { id: "inv-reports", label: "Inventory Reports", icon: "◑", right: "reports.inventory" },
  { id: "acc-reports", label: "Account Reports",   icon: "≡", right: "reports.account" },
  { id: "fin-reports", label: "Financial Reports", icon: "◈", right: "reports.financial" },
  { section: "Admin", rights: ["users.view", "roles.view", "company.view"] },
  // { id: "users",       label: "User Management",   icon: "⊙", right: "users.view" },
  // { id: "roles",       label: "Role Management",   icon: "⚿", right: "roles.view" },
  { id: "company",     label: "Company Settings",  icon: "⚙", right: "company.view" },
];

function SidebarContent({ page, setPage, onLogout, onClose, expanded, onToggle }) {
  const { hasRight, hasAnyRight, user } = useAuth();

  const handleNav = (id) => {
    setPage(id);
    onClose?.();
  };

  const visibleNav = NAV.filter(n => {
    if (n.section) return hasAnyRight(n.rights || [n.right]);
    return hasRight(n.right);
  });

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
              {user?.role_name || "Accounting & Inventory"}
            </div>
          </div>
        )}

        <button
          onClick={onToggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="sb-toggle-btn"
        >
          {expanded ? "←" : "→"}
        </button>

        {onClose && expanded && (
          <button onClick={onClose} className="sb-close-btn">×</button>
        )}
      </div>

      {/* Nav */}
      <div className="sb-nav">
        {visibleNav.map((n, i) => {
          if (n.section) {
            if (!expanded) return <div key={i} className="sb-section-divider" />;
            return <div key={i} className="sb-section-label">{n.section}</div>;
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
                {expanded && <span className="sb-nav-label">{n.label}</span>}
              </button>

              {!expanded && (
                <span className="sidebar-tooltip sb-tooltip">{n.label}</span>
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

export default function Sidebar({ page, setPage, onLogout, mobileOpen, setMobileOpen }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="sidebar-desktop">
        <SidebarContent
          page={page}
          setPage={setPage}
          onLogout={onLogout}
          expanded={expanded}
          onToggle={() => setExpanded(e => !e)}
        />
      </div>

      <div
        className={`sidebar-overlay ${mobileOpen ? "sidebar-overlay-open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <div className={`sidebar-drawer${mobileOpen ? " open" : ""}`}>
        <SidebarContent
          page={page}
          setPage={setPage}
          onLogout={onLogout}
          onClose={() => setMobileOpen(false)}
          expanded={true}
          onToggle={() => {}}
        />
      </div>
    </>
  );
}
