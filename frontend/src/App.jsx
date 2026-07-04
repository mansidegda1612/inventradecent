import { useState } from "react";
import * as XLSX from "xlsx";
window.XLSX = XLSX; // make it available to DataGrid
import "./style/global.css";
// import "./style/transaction.css";

// Layout
import Sidebar from "./components/layout/Sidebar";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import AccountMaster from "./pages/AccountMaster";
// import CategoryMaster   from "./pages/CategoryMaster";
import ProductMaster from "./pages/ProductMaster";
import BarcodeGenerator from "./pages/BarcodeGenerator";
import PurchaseEntry from "./pages/PurchaseEntry";
import SaleEntry from "./pages/SaleEntry";
import InventoryReports from "./pages/InventoryReports";
import AccountReports from "./pages/AccountReports";
import FinancialReports from "./pages/FinancialReports";


const PAGE_LABELS = {
  dashboard: "Dashboard",
  users: "User Management",
  accounts: "Account Master",
  // categories:   "Category Master",
  products: "Product Master",
  barcode: "Barcode Generator",
  purchase: "Purchase Entry",
  sale: "Sale Entry",
  "inv-reports": "Inventory Reports",
  "acc-reports": "Account Reports",
  "fin-reports": "Financial Reports",
};

// Hamburger icon SVG
function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function App() {
  const [role, setRole] = useState(localStorage.getItem("userRole") ? parseInt(localStorage.getItem("userRole")) : null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // read last visited page on load, fall back to "dashboard"
  const [page, setPageState] = useState(() => sessionStorage.getItem("currentPage") || "dashboard");



  const islogin = localStorage.getItem("token") != undefined;
  if (!islogin) return <Login onLogin={setRole} />;

  // ✅ Option 2 — render function, no memo needed
  function renderPage(page) {
    switch (page) {
      case "dashboard": return <Dashboard />;
      case "users": return <UserManagement />;
      case "accounts": return <AccountMaster />;
      case "products": return <ProductMaster />;
      case "barcode": return <BarcodeGenerator />;
      case "purchase": return <PurchaseEntry />;
      case "sale": return <SaleEntry />;
      case "inv-reports": return <InventoryReports />;
      case "acc-reports": return <AccountReports />;
      case "fin-reports": return <FinancialReports />;
      default: return <p style={{ color: "#6B7280" }}>Page not found.</p>;
    }
  }

  const setPage = (p) => {
    sessionStorage.setItem("currentPage", p);
    setPageState(p);
  };

  const handleLogout = () => { sessionStorage.clear(); localStorage.clear(); setRole(null); setPageState("dashboard"); setMobileOpen(false); };

  return (
    <>

      {/* Mobile top bar — only visible on mobile via CSS */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setMobileOpen(true)}>
          <HamburgerIcon />
        </button>
        <span className="mobile-topbar-title">
          <span>Inventra</span>Decent
        </span>
        <span style={{ fontSize: 12, color: "#6B7280", marginLeft: "auto" }}>
          {PAGE_LABELS[page] || ""}
        </span>
      </div>

      <div className="app-shell">
        <Sidebar
          page={page}
          setPage={setPage}
          role={role}
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
