import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
window.XLSX = XLSX; // make it available to DataGrid
import "./style/global.css";
import "./style/responsive.css";
import "./style/platform.css";
// import "./style/transaction.css";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { setUpgradeRequiredHandler } from "./utils/callserver";
import { Modal, Btn, GlobalLoader } from "./components/ui";

// Layout
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import RoleMaster from "./pages/RoleMaster";
import CompanyMaster from "./pages/CompanyMaster";
import AccountMaster from "./pages/AccountMaster";
import ProductMaster from "./pages/ProductMaster";
import BarcodeGenerator from "./pages/BarcodeGenerator";
import PurchaseEntry from "./pages/PurchaseEntry";
import CashReceiptEntry from "./pages/CashReceiptEntry";
import CashPaymentEntry from "./pages/CashPaymentEntry";
import SaleEntry from "./pages/SaleEntry";
import InventoryReports from "./pages/InventoryReports";
import AccountReports from "./pages/AccountReports";
import FinancialReports from "./pages/FinancialReports";
import Plans from "./pages/Plans";
import AccountSettings from "./pages/AccountSettings";
import PlatformConsole from "./pages/platform/PlatformConsole";

// Right required to view each page — used both to guard direct navigation
// (e.g. a stale sessionStorage value pointing at a page the role lost
// access to) and as a fallback if the sidebar entry was somehow bypassed.
const PAGE_RIGHTS = {
  dashboard: "dashboard.view",
  users: "users.view",
  roles: "roles.view",
  company: "company.view",
  accounts: "accounts.view",
  products: "products.view",
  barcode: "barcode.generate",
  purchase: "purchase.view",
  sale: "sale.view",
  "cash-receipt": "cash_receipt.view",
  "cash-payment": "cash_payment.view",
  "inv-reports": "reports.inventory",
  "acc-reports": "reports.account",
  "fin-reports": "reports.financial",
};

// Trial and renewal countdowns live in the header (next to the account menu)
// since they're informational, not blocking. This banner is the safety net for
// a blocked account that somehow still rendered the full shell — normally a
// lapsed account gets <SubscriptionLock/> (owner) or no session at all (staff).
function SubscriptionBanner({ subscription, isPlatformAdmin }) {
  if (!subscription || isPlatformAdmin) return null;

  if (["expired", "past_due", "canceled"].includes(subscription.status)) {
    return (
      <div className="sub-banner sub-banner-expired">
        Your subscription has ended, so access is paused. Renew from Plans &amp; Billing to unlock your data — nothing has been deleted.
      </div>
    );
  }

  return null;
}

// Why the trial/subscription stopped, in the customer's words rather than the
// enum's. `past_due` specifically means a charge was attempted and failed, so
// it gets a different ask than a trial that simply ran out.
const LOCK_COPY = {
  past_due: {
    title: "We couldn't process your payment",
    body: "Your last subscription payment didn't go through, so access is paused. Pick your plan below to settle it and pick up right where you left off.",
  },
  canceled: {
    title: "Your subscription is cancelled",
    body: "Access is paused because your subscription was cancelled. Choose a plan below to start it up again.",
  },
  expired: {
    title: "Your trial has ended",
    body: "Access is paused until a plan is active. Choose one below and you're back in immediately.",
  },
};

// What the account owner of a lapsed account sees instead of the app: the
// reason, and the Plans page. Nothing else is reachable — every tenant API
// route is blocked server-side by requireActiveSubscription while
// routes/billing.js deliberately stays open, so this is the only screen that
// could function anyway. Staff users never get here: they're refused a session
// outright (403 SUBSCRIPTION_EXPIRED from /auth/login).
function SubscriptionLock() {
  const { user, logout, subscription, refreshMe } = useAuth();
  const copy = LOCK_COPY[subscription?.status] || LOCK_COPY.expired;

  // Activation is driven by Razorpay's webhook, which lands a few seconds after
  // checkout closes — and it's /auth/me that reports the account as unlocked.
  // Poll while this screen is up so a customer who just paid gets let back in
  // on their own, instead of sitting on a lock screen guessing at a refresh.
  // Silent: this is background work the user didn't ask for.
  useEffect(() => {
    const timer = setInterval(() => refreshMe({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [refreshMe]);

  return (
    <div className="sub-lock">
      <div className="sub-lock-bar">
        <div className="sub-lock-brand">
          <span className="login-brand-highlight">Inventra</span>Decent
        </div>
        <div className="sub-lock-bar-right">
          <span className="sub-lock-who">{user?.name}</span>
          <Btn variant="ghost" onClick={logout}>Sign Out</Btn>
        </div>
      </div>

      <div className="sub-lock-body">
        <div className="sub-lock-card">
          <h2 className="sub-lock-title">{copy.title}</h2>
          <p className="sub-lock-text">{copy.body}</p>
          <p className="sub-lock-reassure">
            Your data is untouched — products, invoices, ledgers and reports are all exactly as you left them.
          </p>
        </div>

        <Plans />
      </div>
    </div>
  );
}

function AppShell() {
  const { user, ready, hasRight, subscription } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPageState] = useState(() => sessionStorage.getItem("currentPage") || "dashboard");
  const [upgradeInfo, setUpgradeInfo] = useState(null);

  // Any API call anywhere in the app that comes back 402 UPGRADE_REQUIRED /
  // USER_LIMIT_REACHED / SUBSCRIPTION_INACTIVE pops this same dialog,
  // instead of each form having to know about billing.
  useEffect(() => {
    setUpgradeRequiredHandler((info) => setUpgradeInfo(info));
    return () => setUpgradeRequiredHandler(null);
  }, []);

  // Still hydrating auth/me on load — avoid a login-screen flash for users
  // with a valid token already in localStorage.
  if (!ready) return null;

  if (!user) return <Login />;

  // The SaaS owner gets a different app off the same login form. Returning here
  // means the tenant Sidebar/Header/SubscriptionBanner never mount, so there's
  // no customer-facing menu to hide (or to leak by forgetting to hide it) — and
  // no tenant page is reachable, since a console session carries rights: [] and
  // no org for the server to scope anything to.
  if (user.padmin) return <PlatformConsole />;

  // Trial over / subscription lapsed, and this is the account owner — the one
  // person who can fix it. Locked to billing until they do. `billing_only` is
  // the server's call (routes/auth.js sessionFlags), not something derived from
  // the status string here, so the frontend can't drift from enforcement.
  if (user.billing_only) return <SubscriptionLock />;

  function renderPage(page) {
    // Server is still the real gate (every mutating route re-checks via
    // requireRight) — this just avoids rendering a page whose buttons
    // would all fail anyway.
    const needed = PAGE_RIGHTS[page];
    if (needed && !hasRight(needed)) {
      return <p className="app-notfound">You don't have access to this page. Contact an admin if you think this is a mistake.</p>;
    }

    switch (page) {
      case "dashboard": return <Dashboard />;
      case "users": return <UserManagement />;
      case "roles": return <RoleMaster />;
      case "company": return <CompanyMaster />;
      case "accounts": return <AccountMaster />;
      case "products": return <ProductMaster />;
      case "barcode": return <BarcodeGenerator />;
      case "purchase": return <PurchaseEntry />;
      case "sale": return <SaleEntry />;
      case "cash-receipt": return <CashReceiptEntry />;
      case "cash-payment": return <CashPaymentEntry />;
      case "inv-reports": return <InventoryReports />;
      case "acc-reports": return <AccountReports />;
      case "fin-reports": return <FinancialReports />;
      case "plans": return <Plans />;
      case "account": return <AccountSettings setPage={setPage} />;
      default: return <p className="app-notfound">Page not found.</p>;
    }
  }

  const setPage = (p) => {
    sessionStorage.setItem("currentPage", p);
    setPageState(p);
  };

  return (
    <>
      <SubscriptionBanner subscription={subscription} isPlatformAdmin={user?.padmin} />

      <div className="app-shell">
        <Sidebar
          page={page}
          setPage={setPage}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />

        <div className="main-content-wrap">
          <Header
            setPage={setPage}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
          />
          <main className="main-content">
            {renderPage(page)}
          </main>
        </div>
      </div>

      <Modal open={!!upgradeInfo} onClose={() => setUpgradeInfo(null)} title="Upgrade required" width={420}>
        <p>{upgradeInfo?.message}</p>
        <div className="upgrade-modal-actions">
          <Btn onClick={() => { setPage("plans"); setUpgradeInfo(null); }}>View Plans</Btn>
          <Btn variant="ghost" onClick={() => setUpgradeInfo(null)}>Close</Btn>
        </div>
      </Modal>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
      {/* Outside AppShell so it also covers the Login screen, the platform
          console, and the !ready hydration gap — all of which return early. */}
      <GlobalLoader />
    </AuthProvider>
  );
}
