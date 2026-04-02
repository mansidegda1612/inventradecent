const autogen = require("swagger-autogen")();

const doc = {
  info: {
    title: "Billing System API",
    description: "Auto-generated API docs for Billing Backend",
    version: "1.0.0",
  },
  host: "localhost:5000",
  basePath: "/api",
  schemes: ["http"],
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      in: "header",
      name: "Authorization",
      description: 'Enter your token as: Bearer &lt;token&gt;',
    },
  },
  security: [{ bearerAuth: [] }],

  // ── Tag groups (shows sections in Swagger UI) ──────────────────────────
  tags: [
    { name: "Auth",         description: "Login, Register, Token refresh" },
    { name: "Account",      description: "My profile & password"           },
    { name: "Dashboard",    description: "Stats, charts, summaries"        },
    { name: "Products",     description: "Product CRUD + stock"            },
    { name: "Categories",   description: "Category CRUD"                   },
    { name: "Groups",       description: "Customer group CRUD"             },
    { name: "Customers",    description: "Customer CRUD + ledger"          },
    { name: "Transactions", description: "Billing — create, edit, cancel"  },
    { name: "Users",        description: "User management (admin)"         },
    { name: "User Roles",   description: "Role & rights management"        },
  ],

  // ── Reusable request body definitions ──────────────────────────────────
  definitions: {
    Login: {
      required: ["userid", "password"],
      properties: {
        userid:   { type: "string", example: "admin" },
        password: { type: "string", example: "admin123" },
      },
    },
    Register: {
      required: ["name", "userid", "password"],
      properties: {
        name:     { type: "string",  example: "John Doe" },
        userid:   { type: "string",  example: "john01" },
        password: { type: "string",  example: "pass@123" },
        userrole: { type: "integer", example: 1 },
      },
    },
    Category: {
      required: ["name"],
      properties: { name: { type: "string", example: "Electronics" } },
    },
    Group: {
      required: ["name"],
      properties: { name: { type: "string", example: "Retail" } },
    },
    Customer: {
      required: ["name"],
      properties: {
        name:       { type: "string",  example: "Ravi Shah" },
        contact_no: { type: "string",  example: "9876543210" },
        city:       { type: "string",  example: "Ahmedabad" },
        gstin:      { type: "string",  example: "24AABCU9603R1ZX" },
        group:      { type: "integer", example: 1 },
        address:    { type: "string",  example: "123 Main Road" },
        opening:    { type: "number",  example: 0 },
        credit:     { type: "number",  example: 0 },
        debit:      { type: "number",  example: 0 },
        closing:    { type: "number",  example: 0 },
      },
    },
    Product: {
      required: ["name", "purc_rate", "sale_rate"],
      properties: {
        name:      { type: "string",  example: "Samsung TV 32" },
        category:  { type: "string",  example: "Electronics" },
        purc_rate: { type: "number",  example: 8000 },
        sale_rate: { type: "number",  example: 9500 },
        hsn_code:  { type: "string",  example: "85287200" },
        barcode:   { type: "string",  example: "ABC123" },
        o_qty:     { type: "number",  example: 10 },
      },
    },
    TransactionItem: {
      properties: {
        product_id:     { type: "integer", example: 1 },
        s_qty:          { type: "number",  example: 2 },
        p_qty:          { type: "number",  example: 0 },
        rate:           { type: "number",  example: 9500 },
        taxable_amount: { type: "number",  example: 19000 },
        CGST:           { type: "number",  example: 1710 },
        SGST:           { type: "number",  example: 1710 },
        final_amount:   { type: "number",  example: 22420 },
      },
    },
    Transaction: {
      required: ["bill_no", "customer_id", "items"],
      properties: {
        bill_no:     { type: "string",  example: "BILL-0001" },
        date:        { type: "string",  example: "2024-03-01T10:00:00Z" },
        customer_id: { type: "integer", example: 1 },
        discount:    { type: "number",  example: 0 },
        roundoff:    { type: "number",  example: 0.50 },
        items: {
          type: "array",
          items: { $ref: "#/definitions/TransactionItem" },
        },
      },
    },
    User: {
      required: ["name", "userid", "password"],
      properties: {
        name:     { type: "string",  example: "Jane Doe" },
        userid:   { type: "string",  example: "jane01" },
        password: { type: "string",  example: "pass@123" },
        userrole: { type: "integer", example: 1 },
        rights:   { type: "string",  example: "read,write" },
      },
    },
    UserRole: {
      required: ["role"],
      properties: {
        role:   { type: "string", example: "Manager" },
        rights: { type: "string", example: "read,write,delete" },
      },
    },
  },
};

const outputFile  = "./swagger-output.json";         // generated file
const routeFiles  = [
  "./routes/auth.js",
  "./routes/account.js",
  "./routes/dashboard.js",
  "./routes/product.js",
  "./routes/category.js",
  "./routes/group.js",
  "./routes/customer.js",
  "./routes/transaction.js",
  "./routes/user.js",
  "./routes/userrole.js",
];

autogen(outputFile, routeFiles, doc).then(() => {
    require("./server"); // ensures proper path resolution
});
