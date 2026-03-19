export const INIT_USERS = [
  { id: 1, name: "Admin User", email: "admin@inventra.com", role: "admin", active: true },
  { id: 2, name: "Sales Staff", email: "sales@inventra.com", role: "user", active: true },
];

export const INIT_CATEGORIES = [
  { id: 1, name: "Electronics", description: "Electronic items" },
  { id: 2, name: "Stationery", description: "Office supplies" },
  { id: 3, name: "FMCG", description: "Fast moving consumer goods" },
];

export const INIT_ACCOUNTS = [
  { id: 1, name: "Reliance Industries", type: "supplier", city: "Mumbai", gst: "27AAACR5055K1ZS", opening: 50000 },
  { id: 2, name: "Tata Electronics", type: "customer", city: "Delhi", gst: "07AAACT2727Q1ZF", opening: 20000 },
  { id: 3, name: "Mahesh Traders", type: "customer", city: "Rajkot", gst: "24AAJCM3827R1ZW", opening: 0 },
];

export const INIT_PRODUCTS = [
  { id: 1, name: "HP Laptop 15s", categoryId: 1, barcode: "BAR001", gst: 18, rate: 45000, qty: 10 },
  { id: 2, name: "A4 Paper Ream", categoryId: 2, barcode: "BAR002", gst: 12, rate: 250, qty: 150 },
  { id: 3, name: "USB-C Cable", categoryId: 1, barcode: "BAR003", gst: 18, rate: 299, qty: 80 },
  { id: 4, name: "Stapler Set", categoryId: 2, barcode: "BAR004", gst: 12, rate: 120, qty: 5 },
];

export const INIT_PURCHASES = [
  {
    id: 1,
    supplierId: 1,
    billNo: "PUR-001",
    date: "2025-03-10",
    items: [
      { productId: 1, qty: 5, rate: 42000 },
      { productId: 3, qty: 20, rate: 280 },
    ],
    total: 216200,
  },
];

export const INIT_SALES = [
  {
    id: 1,
    customerId: 2,
    invoiceNo: "SAL-001",
    date: "2025-03-12",
    items: [
      { productId: 1, qty: 2, rate: 45000 },
      { productId: 3, qty: 10, rate: 299 },
    ],
    total: 109130,
  },
  {
    id: 2,
    customerId: 3,
    invoiceNo: "SAL-002",
    date: "2025-03-15",
    items: [{ productId: 2, qty: 20, rate: 250 }],
    total: 5600,
  },
];
