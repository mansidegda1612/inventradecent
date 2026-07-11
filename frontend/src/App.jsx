import { useState } from "react";
import * as XLSX from "xlsx";
window.XLSX = XLSX; // make it available to DataGrid
import "./style/global.css";
import "./style/responsive.css";
// import "./style/transaction.css";

import { AuthProvider, useAuth } from "./context/AuthContext";

// Layout
import Sidebar from "./components/layout/Sidebar";

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

const PAGE_LABELS = {
  dashboard: "Dashboard",
  users: "User Management",
  roles: "Role Management",
  company: "Company Settings",
  accounts: "Account Master",
  products: "Product Master",
  barcode: "Barcode Generator",
  purchase: "Purchase Entry",
  "cash-receipt": "Cash/Bank Receipt",
  "cash-payment": "Cash/Bank Payment",
  sale: "Sale Entry",
  "inv-reports": "Inventory Reports",
  "acc-reports": "Account Reports",
  "fin-reports": "Financial Reports",
};

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

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function AppShell() {
  const { user, ready, hasRight, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPageState] = useState(() => sessionStorage.getItem("currentPage") || "dashboard");

  // Still hydrating auth/me on load — avoid a login-screen flash for users
  // with a valid token already in localStorage.
  if (!ready) return null;

  if (!user) return <Login />;

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
      default: return <p className="app-notfound">Page not found.</p>;
    }
  }

  const setPage = (p) => {
    sessionStorage.setItem("currentPage", p);
    setPageState(p);
  };

  const handleLogout = () => {
    logout();
    setPageState("dashboard");
    setMobileOpen(false);
  };

  return (
    <>
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setMobileOpen(true)}>
          <HamburgerIcon />
        </button>
        <span className="mobile-topbar-title">
          <span>Inventra</span>Decent
        </span>
        <span className="app-role-label">{PAGE_LABELS[page] || ""}</span>
      </div>

      <div className="app-shell">
        <Sidebar
          page={page}
          setPage={setPage}
          onLogout={handleLogout}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />

        <main className="main-content">
          {renderPage(page)}
        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
