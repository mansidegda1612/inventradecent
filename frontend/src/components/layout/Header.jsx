import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

// Never negative, always rounds up so "expires in a few hours" still reads
// as "1 day left" rather than "0".
function daysRemaining(dateStr) {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// Left side of the header: active org name, clickable to switch when the
// account has more than one. Replaces what used to be the page title there
// (which just duplicated the PageHeader every page already renders).
function OrgSwitcher({ org, orgs, switchOrg }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handlePick = async (orgId) => {
    setOpen(false);
    if (String(orgId) === String(org?.id)) return;
    setSwitching(true);
    try { await switchOrg(orgId); } finally { setSwitching(false); }
  };

  const canSwitch = orgs.length > 1;

  return (
    <div className="org-switcher" ref={ref}>
      <button
        className="org-switcher-trigger"
        onClick={() => canSwitch && setOpen(o => !o)}
        disabled={switching}
        title={canSwitch ? "Switch organization" : undefined}
      >
        <span className="org-switcher-name">{switching ? "Switching…" : (org?.name || "")}</span>
        {canSwitch && <span className="org-switcher-caret">▾</span>}
      </button>

      {open && canSwitch && (
        <div className="org-switcher-dropdown">
          {orgs.map(o => (
            <button
              key={o.id}
              className={`org-switcher-item ${o.id === org?.id ? "org-switcher-item-active" : ""}`}
              onClick={() => handlePick(o.id)}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ setPage, mobileOpen, setMobileOpen }) {
  const { user, org, orgs, switchOrg, logout, subscription } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();

  const go = (page) => { setPage(page); setMenuOpen(false); };

  // logout() already clears session storage, but `page` is in-memory React
  // state that survives the AppShell staying mounted — reset it explicitly
  // so the next login on this browser doesn't land on whatever page was
  // open when the previous user signed out.
  const handleSignOut = () => {
    setMenuOpen(false);
    logout();
    setPage("dashboard");
  };

  return (
    <header className="app-topbar">
      <button className="hamburger" onClick={() => setMobileOpen(true)}>
        <HamburgerIcon />
      </button>

      <OrgSwitcher org={org} orgs={orgs} switchOrg={switchOrg} />

      {subscription?.status === "trialing" && (
        <button className="trial-pill" onClick={() => setPage("plans")}>
          Trial: {daysRemaining(subscription.trial_ends_at)}d left
          <span className="trial-pill-upgrade">Upgrade</span>
        </button>
      )}

      <div className="account-menu" ref={menuRef}>
        <button className="account-menu-trigger" onClick={() => setMenuOpen(o => !o)}>
          <span className="account-menu-avatar">{initial}</span>
          <span className="account-menu-name">{user?.name}</span>
          <span className="account-menu-caret">▾</span>
        </button>

        {menuOpen && (
          <div className="account-menu-dropdown">
            <div className="account-menu-section">
              <div className="account-menu-user">{user?.name}</div>
              <div className="account-menu-sub">{user?.user_id}</div>
              {user?.role_name && <div className="account-menu-sub">{user.role_name}</div>}
            </div>

            <button className="account-menu-item" onClick={() => go("account")}>Account Settings</button>
            <button className="account-menu-item" onClick={() => go("company")}>Organization Details</button>
            <button className="account-menu-item" onClick={() => go("plans")}>Plans & Billing</button>
            <button className="account-menu-item account-menu-item-danger" onClick={handleSignOut}>Sign Out</button>
          </div>
        )}
      </div>
    </header>
  );
}
