import { useState } from "react";
import "./style/Global.css";

// Layout
import Sidebar from "./components/layout/Sidebar";

// Pages
import Login            from "./pages/Login";
import Dashboard        from "./pages/Dashboard";
import UserManagement   from "./pages/UserManagement";
import AccountMaster    from "./pages/AccountMaster";
import CategoryMaster   from "./pages/CategoryMaster";
import ProductMaster    from "./pages/ProductMaster";
import BarcodeGenerator from "./pages/BarcodeGenerator";
import PurchaseEntry    from "./pages/PurchaseEntry";
import SaleEntry        from "./pages/SaleEntry";
import InventoryReports from "./pages/InventoryReports";
import AccountReports   from "./pages/AccountReports";
import FinancialReports from "./pages/FinancialReports";

// Data
import {
  INIT_USERS,
  INIT_CATEGORIES,
  INIT_ACCOUNTS,
  INIT_PRODUCTS,
  INIT_PURCHASES,
  INIT_SALES,
} from "./data/initialData";

export default function App() {
  const [role, setRole] = useState(null);
  const [page, setPage] = useState("dashboard");

  // Global state
  const [users,     setUsers]     = useState(INIT_USERS);
  const [categories, setCategories] = useState(INIT_CATEGORIES);
  const [accounts,  setAccounts]  = useState(INIT_ACCOUNTS);
  const [products,  setProducts]  = useState(INIT_PRODUCTS);
  const [purchases, setPurchases] = useState(INIT_PURCHASES);
  const [sales,     setSales]     = useState(INIT_SALES);

  // Show login if not authenticated
  if (!role) return <Login onLogin={setRole} />;

  // Page map
  const pages = {
    dashboard:    <Dashboard        products={products} sales={sales} purchases={purchases} accounts={accounts} />,
    users:        <UserManagement   users={users} setUsers={setUsers} />,
    accounts:     <AccountMaster    accounts={accounts} setAccounts={setAccounts} />,
    categories:   <CategoryMaster   categories={categories} setCategories={setCategories} products={products} />,
    products:     <ProductMaster    products={products} setProducts={setProducts} categories={categories} />,
    barcode:      <BarcodeGenerator products={products} />,
    purchase:     <PurchaseEntry    purchases={purchases} setPurchases={setPurchases} products={products} setProducts={setProducts} accounts={accounts} />,
    sale:         <SaleEntry        sales={sales} setSales={setSales} products={products} setProducts={setProducts} accounts={accounts} />,
    "inv-reports": <InventoryReports products={products} categories={categories} sales={sales} purchases={purchases} />,
    "acc-reports": <AccountReports   accounts={accounts} sales={sales} purchases={purchases} />,
    "fin-reports": <FinancialReports sales={sales} purchases={purchases} products={products} />,
  };

  return (
    <>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar
          page={page}
          setPage={setPage}
          role={role}
          onLogout={() => { setRole(null); setPage("dashboard"); }}
        />
        <main style={{ flex: 1, padding: "28px 32px", overflowY: "auto", background: "#F4F6FA" }}>
          {pages[page] || <p style={{ color: "#6B7280" }}>Page not found.</p>}
        </main>
      </div>
    </>
  );
}
