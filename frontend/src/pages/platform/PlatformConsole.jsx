// The SaaS owner's console — a completely separate shell from the tenant app.
//
// App.jsx swaps to this instead of AppShell when user.padmin is true, so the
// tenant Sidebar / Header / SubscriptionBanner never mount at all. That's what
// makes "no customer menus here" structural rather than a matter of hiding
// items: there is nothing rendered to leak.
import { useAuth } from "../../context/AuthContext";
import { Btn } from "../../components/ui";
import PlatformAccounts from "./PlatformAccounts";

export default function PlatformConsole() {
  const { user, logout } = useAuth();

  return (
    <div className="pf-shell">
      <header className="pf-topbar">
        <div className="pf-brand">
          <span className="pf-brand-highlight">Inventra</span>Decent
          <span className="pf-brand-tag">Platform</span>
        </div>
        <div className="pf-topbar-right">
          <span className="pf-topbar-user">{user?.name}</span>
          <Btn variant="ghost" small onClick={logout}>Sign Out</Btn>
        </div>
      </header>

      <main className="pf-main">
        <PlatformAccounts />
      </main>
    </div>
  );
}
