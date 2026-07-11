/**
 * config/permissions.js
 *
 * Single source of truth for every permission key in the system.
 * Keys follow "module.action" (e.g. "accounts.edit").
 *
 * IMPORTANT: keep this in sync with frontend/src/utils/permissions.js —
 * the frontend copy drives the checkbox matrix UI, this copy is what
 * requireRight() checks against. They must use identical keys.
 *
 * "*" (wildcard) is treated as "every right" everywhere it is checked —
 * used by the seeded Admin role so you're never locked out.
 */
module.exports = [
  { module: "dashboard", label: "Dashboard", actions: [
    { key: "dashboard.view", label: "View" },
  ]},
  { module: "accounts", label: "Account Master", actions: [
    { key: "accounts.view", label: "View" },
    { key: "accounts.create", label: "Create" },
    { key: "accounts.edit", label: "Edit" },
    { key: "accounts.delete", label: "Delete" },
  ]},
  { module: "products", label: "Product Master", actions: [
    { key: "products.view", label: "View" },
    { key: "products.create", label: "Create" },
    { key: "products.edit", label: "Edit" },
    { key: "products.delete", label: "Delete" },
  ]},
  { module: "barcode", label: "Barcode Generator", actions: [
    { key: "barcode.generate", label: "Generate / Print" },
  ]},
  { module: "purchase", label: "Purchase Entry", actions: [
    { key: "purchase.view", label: "View" },
    { key: "purchase.create", label: "Create" },
    { key: "purchase.edit", label: "Edit" },
    { key: "purchase.delete", label: "Delete" },
    { key: "purchase.print", label: "Print" },
  ]},
  { module: "sale", label: "Sale Entry", actions: [
    { key: "sale.view", label: "View" },
    { key: "sale.create", label: "Create" },
    { key: "sale.edit", label: "Edit" },
    { key: "sale.delete", label: "Delete" },
    { key: "sale.print", label: "Print" },
  ]},
  { module: "cash_receipt", label: "Cash/Bank Receipt", actions: [
    { key: "cash_receipt.view", label: "View" },
    { key: "cash_receipt.create", label: "Create" },
    { key: "cash_receipt.edit", label: "Edit" },
    { key: "cash_receipt.delete", label: "Delete" },
  ]},
  { module: "cash_payment", label: "Cash/Bank Payment", actions: [
    { key: "cash_payment.view", label: "View" },
    { key: "cash_payment.create", label: "Create" },
    { key: "cash_payment.edit", label: "Edit" },
    { key: "cash_payment.delete", label: "Delete" },
  ]},
  { module: "reports", label: "Reports", actions: [
    { key: "reports.inventory", label: "Inventory Reports" },
    { key: "reports.account", label: "Account Reports" },
    { key: "reports.financial", label: "Financial Reports" },
  ]},
  { module: "users", label: "User Management", actions: [
    { key: "users.view", label: "View" },
    { key: "users.create", label: "Create" },
    { key: "users.edit", label: "Edit" },
    { key: "users.delete", label: "Delete" },
  ]},
  { module: "roles", label: "Role Management", actions: [
    { key: "roles.view", label: "View" },
    { key: "roles.create", label: "Create" },
    { key: "roles.edit", label: "Edit" },
    { key: "roles.delete", label: "Delete" },
  ]},
  { module: "company", label: "Company Settings", actions: [
    { key: "company.view", label: "View" },
    { key: "company.edit", label: "Edit" },
  ]},
  { module: "whatsapp", label: "WhatsApp Sharing", actions: [
    { key: "whatsapp.send", label: "Send Bill" },
  ]},
];
