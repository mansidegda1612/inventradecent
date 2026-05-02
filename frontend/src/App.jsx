import { useState } from "react";
import "./style/global.css";

// Layout
import Sidebar from "./components/layout/Sidebar";

// Pages
import Login            from "./pages/Login";
import Dashboard        from "./pages/Dashboard";
import UserManagement   from "./pages/UserManagement";
import AccountMaster    from "./pages/AccountMaster";
// import CategoryMaster   from "./pages/CategoryMaster";
import ProductMaster    from "./pages/ProductMaster";
import BarcodeGenerator from "./pages/BarcodeGenerator";
import PurchaseEntry    from "./pages/PurchaseEntry";
import SaleEntry        from "./pages/SaleEntry";
import InventoryReports from "./pages/InventoryReports";
import AccountReports   from "./pages/AccountReports";
import FinancialReports from "./pages/FinancialReports";

// Data
import {
  INIT_USERS, INIT_CATEGORIES, INIT_ACCOUNTS,
  INIT_PRODUCTS, INIT_PURCHASES, INIT_SALES,
} from "./data/initialData";

const PAGE_LABELS = {
  dashboard:    "Dashboard",
  users:        "User Management",
  accounts:     "Account Master",
  // categories:   "Category Master",
  products:     "Product Master",
  barcode:      "Barcode Generator",
  purchase:     "Purchase Entry",
  sale:         "Sale Entry",
  "inv-reports": "Inventory Reports",
  "acc-reports": "Account Reports",
  "fin-reports": "Financial Reports",
};

// Hamburger icon SVG
function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function App() {
  const [role, setRole]           = useState(sessionStorage.getItem("userRole") ? parseInt(sessionStorage.getItem("userRole")): null);
  const [page, setPage]           = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Global state
  const [users,      setUsers]      = useState(INIT_USERS);
  const [categories, setCategories] = useState(INIT_CATEGORIES);
  const [accounts,   setAccounts]   = useState(INIT_ACCOUNTS);
  const [products,   setProducts]   = useState(INIT_PRODUCTS);
  const [purchases,  setPurchases]  = useState(INIT_PURCHASES);
  const [sales,      setSales]      = useState(INIT_SALES);

  const islogin = sessionStorage.getItem("token") != undefined;
  if (!islogin) return <Login onLogin={setRole} />;

  const pages = {
    dashboard:     <Dashboard        products={products} sales={sales} purchases={purchases} accounts={accounts} />,
    users:         <UserManagement   users={users} setUsers={setUsers} />,
    accounts:      <AccountMaster />,
    // categories:    <CategoryMaster   categories={categories} setCategories={setCategories} products={products} />,
    products:      <ProductMaster />,
    barcode:       <BarcodeGenerator products={products} />,
    purchase:      <PurchaseEntry    purchases={purchases} setPurchases={setPurchases} products={products} setProducts={setProducts} accounts={accounts} />,
    sale:          <SaleEntry        sales={sales} setSales={setSales} products={products} setProducts={setProducts} accounts={accounts} />,
    "inv-reports": <InventoryReports products={products} categories={categories} sales={sales} purchases={purchases} />,
    "acc-reports": <AccountReports   accounts={accounts} sales={sales} purchases={purchases} />,
    "fin-reports": <FinancialReports sales={sales} purchases={purchases} products={products} />,
  };

  const handleLogout = () => { sessionStorage.clear() ; setRole(null); setPage("dashboard"); setMobileOpen(false); };

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
          {pages[page] || <p style={{ color: "#6B7280" }}>Page not found.</p>}
        </main>
      </div>
    </>
  );
}
