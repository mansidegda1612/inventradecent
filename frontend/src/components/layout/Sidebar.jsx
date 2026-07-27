import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";

// Top-level items either navigate directly (Dashboard, Customer/Supplier,
// Products, Barcode) or expand into a sub-menu (Sales, Purchase, Reports,
// User Management). Each leaf declares the right needed to see it; a parent
// shows only if at least one child is visible.
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "⊞", right: "dashboard.view" },
  { id: "accounts", label: "Customer / Supplier", icon: "◉", right: "accounts.view" },
  { id: "products", label: "Products", icon: "⬡", right: "products.view" },
  { id: "barcode", label: "Barcode Generator", icon: "▦", right: "barcode.generate" },
  {
    key: "sales", label: "Sales", icon: "↑", children: [
      { id: "sale", label: "Sale Invoice", right: "sale.view" },
      { id: "cash-receipt", label: "Cash / Bank Receipt", right: "cash_receipt.view" },
    ],
  },
  {
    key: "purchase", label: "Purchase", icon: "↓", children: [
      { id: "purchase", label: "Purchase Invoice", right: "purchase.view" },
      { id: "cash-payment", label: "Cash / Bank Payment", right: "cash_payment.view" },
    ],
  },
  {
    key: "reports", label: "Reports", icon: "◈", children: [
      { id: "inv-reports", label: "Inventory Reports", right: "reports.inventory" },
      { id: "acc-reports", label: "Account Reports", right: "reports.account" },
      { id: "fin-reports", label: "Financial Reports", right: "reports.financial" },
    ],
  },
  {
    key: "user-mgmt", label: "User Management", icon: "⊙", children: [
      { id: "users", label: "Users", right: "users.view" },
      { id: "roles", label: "Roles", right: "roles.view" },
    ],
  },
];

function SidebarContent({ page, setPage, onClose, collapsed = true, onToggleCollapse }) {
  const { hasRight, user } = useAuth();
  const rootRef = useRef(null);

  const visibleNav = NAV.map((item) => {
    if (item.children) {
      const children = item.children.filter((c) => hasRight(c.right));
      return children.length ? { ...item, children } : null;
    }
    return hasRight(item.right) ? item : null;
  }).filter(Boolean);

  const activeParent = NAV.find((n) => n.children?.some((c) => c.id === page))?.key;
  const [openKeys, setOpenKeys] = useState(() => (activeParent ? [activeParent] : []));
  const toggleGroup = (key) =>
    setOpenKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));

  // In the collapsed rail a click "pins" a group's flyout open (so you can
  // move to and click a sub-item); hover/focus open it too. Clicking the same
  // group again, choosing a sub-item, or clicking outside closes it.
  const [pinnedKey, setPinnedKey] = useState(null);
  // After navigating from a collapsed flyout, force that node's flyout hidden
  // until the cursor leaves it — otherwise the just-clicked item keeps focus
  // (and the cursor lingers over it), so :focus-within/:hover would keep the
  // flyout covering the page. Cleared on mouseleave so hovering it again works.
  const [suppressedKey, setSuppressedKey] = useState(null);
  useEffect(() => {
    if (!pinnedKey) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setPinnedKey(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pinnedKey]);

  const go = (id, nodeKey) => {
    setPinnedKey(null);
    setSuppressedKey(nodeKey ?? null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setPage(id);
    onClose?.();
  };
  const clearSuppressed = (nodeKey) => setSuppressedKey((s) => (s === nodeKey ? null : s));
  const onParentClick = (item) => {
    if (collapsed) setPinnedKey((k) => (k === item.key ? null : item.key));
    else toggleGroup(item.key);
  };

  return (
    <div ref={rootRef} className={`sb-root ${collapsed ? "sb-collapsed" : "sb-expanded"}`}>
      <div className="sb-header">
        <div className="sb-brand-wrap">
          <div className="sb-brand"><span className="sb-brand-highlight">Inventra</span>Decent</div>
          <div className="sb-subtitle">{user?.role_name || "Accounting & Inventory"}</div>
        </div>
        {/* collapsed logo mark (desktop rail) */}
        <div className="sb-logo-mark"><span className="sb-brand-highlight">I</span>D</div>
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="sb-collapse-btn" title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? "»" : "«"}
          </button>
        )}
        {onClose && <button onClick={onClose} className="sb-close-btn" aria-label="Close menu">×</button>}
      </div>

      <nav className="sb-nav">
        {visibleNav.map((item) => {
          // ── single item ──────────────────────────────────────────────
          if (!item.children) {
            return (
              <div
                key={item.id}
                className={`sb-node ${suppressedKey === item.id ? "sb-node-suppressed" : ""}`}
                onMouseLeave={() => clearSuppressed(item.id)}
              >
                <button
                  onClick={() => go(item.id, item.id)}
                  className={`sb-item ${page === item.id ? "sb-item-active" : ""}`}
                >
                  <span className="sb-icon">{item.icon}</span>
                  <span className="sb-label">{item.label}</span>
                </button>
                {/* flyout label, shown only when the rail is collapsed */}
                <div className="sb-flyout">
                  <button className="sb-flyout-item" onClick={() => go(item.id, item.id)}>{item.label}</button>
                </div>
              </div>
            );
          }

          // ── group with sub-menu ──────────────────────────────────────
          const isOpen = openKeys.includes(item.key);
          const hasActiveChild = item.children.some((c) => c.id === page);
          return (
            <div
              key={item.key}
              className={`sb-node sb-group ${pinnedKey === item.key ? "sb-node-pinned" : ""} ${suppressedKey === item.key ? "sb-node-suppressed" : ""}`}
              onMouseLeave={() => clearSuppressed(item.key)}
            >
              <button
                onClick={() => onParentClick(item)}
                className={`sb-parent ${hasActiveChild ? "sb-parent-active" : ""}`}
                aria-expanded={collapsed ? pinnedKey === item.key : isOpen}
              >
                <span className="sb-icon">{item.icon}</span>
                <span className="sb-label">{item.label}</span>
                <span className={`sb-caret ${isOpen ? "sb-caret-open" : ""}`}>›</span>
              </button>

              {/* inline sub-menu (expanded rail, open group) */}
              {isOpen && (
                <div className="sb-sub">
                  {item.children.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => go(c.id)}
                      className={`sb-sub-btn ${page === c.id ? "sb-sub-btn-active" : ""}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              {/* flyout sub-menu (collapsed rail, on hover/focus) */}
              <div className="sb-flyout">
                <div className="sb-flyout-title">{item.label}</div>
                {item.children.map((c) => (
                  <button
                    key={c.id}
                    className={`sb-flyout-item ${page === c.id ? "sb-flyout-item-active" : ""}`}
                    onClick={() => go(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default function Sidebar({ page, setPage, mobileOpen, setMobileOpen }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sb-collapsed") === "1");
  const toggleCollapse = () =>
    setCollapsed((v) => { localStorage.setItem("sb-collapsed", v ? "0" : "1"); return !v; });

  return (
    <>
      {/* desktop rail — collapsible */}
      <div className="sidebar-desktop">
        <SidebarContent page={page} setPage={setPage} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </div>

      {/* mobile drawer — always full width, never collapsed */}
      <div
        className={`sidebar-overlay ${mobileOpen ? "sidebar-overlay-open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <div className={`sidebar-drawer${mobileOpen ? " open" : ""}`}>
        <SidebarContent page={page} setPage={setPage} onClose={() => setMobileOpen(false)} />
      </div>
    </>
  );
}
