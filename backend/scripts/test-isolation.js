// Phase 3 isolation proof — the "Done when" check for the org-scoping work.
//
// Creates two brand-new orgs (via /auth/signup), seeds one org with a
// category/product/customer/transaction, then confirms the OTHER org can
// neither read nor write any of it — by id, by list, by report totals, or
// by referencing it from a POST body. Cleans up both test accounts when
// done, whether the run passed or failed.
//
// Usage:  node scripts/test-isolation.js   (backend server must be running)

require("dotenv").config();
const pool = require("../config/db");

const BASE_URL = process.env.API_URL || "http://localhost:5000/api/";
const stamp = Date.now();

async function call(path, method, token, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const failures = [];
function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? " — " + JSON.stringify(detail) : ""}`);
    failures.push(label);
  }
}

async function signup(tag) {
  const r = await call("auth/signup", "POST", null, {
    name: `${tag} Owner`,
    email: `isolation_${tag}_${stamp}@example.com`,
    password: "TestPass123!",
    business_name: `${tag} Traders ${stamp}`,
  });
  if (!r.body?.success) throw new Error(`signup(${tag}) failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.data.accessToken, orgId: r.body.data.org.id, userId: r.body.data.user.id };
}

async function cleanupAccount(ownerEmailLike) {
  const [accounts] = await pool.query("SELECT id FROM account WHERE owner_email LIKE ?", [ownerEmailLike]);
  for (const acc of accounts) {
    const [orgs] = await pool.query("SELECT id FROM organization WHERE account_id = ?", [acc.id]);
    for (const org of orgs) {
      await pool.query("DELETE FROM transaction_adjustments WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM transaction_items WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM cashcustdetail WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM `transaction` WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM customer WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM product WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM category WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM `group` WHERE org_id = ?", [org.id]);
      await pool.query("DELETE FROM organization_bank WHERE org_id = ?", [org.id]);
    }
    const [users] = await pool.query("SELECT id FROM user WHERE account_id = ?", [acc.id]);
    for (const u of users) {
      await pool.query("DELETE FROM user_org_access WHERE user_id = ?", [u.id]);
      await pool.query("DELETE FROM user WHERE id = ?", [u.id]);
    }
    await pool.query("DELETE FROM subscription WHERE account_id = ?", [acc.id]);
    await pool.query("DELETE FROM organization WHERE account_id = ?", [acc.id]);
    await pool.query("DELETE FROM account WHERE id = ?", [acc.id]);
  }
}

async function main() {
  console.log(`Isolation test run ${stamp}\n`);
  let orgA, orgB;
  try {
    orgA = await signup("orgA");
    orgB = await signup("orgB");
    console.log(`orgA id=${orgA.orgId}  orgB id=${orgB.orgId}\n`);

    // ── seed data in org A ────────────────────────────────────────────────
    const cat = await call("categories/", "POST", orgA.token, { name: `Cat-${stamp}` });
    check("org A can create a category", cat.status === 201, cat.body);
    const catId = cat.body?.data?.id;

    const prod = await call("products/", "POST", orgA.token, {
      name: `Prod-${stamp}`, category: catId, purc_rate: 10, sale_rate: 20,
      hsn_code: "1234", barcode: `B${String(stamp).slice(-9)}`, gstPer: 0, o_qty: 100, lowstockqty: 5,
    });
    check("org A can create a product", prod.status === 201, prod.body);
    const prodId = prod.body?.data?.id;

    const cust = await call("customers/", "POST", orgA.token, {
      name: `Cust-${stamp}`, contact_no: "9999999999", opening: 0,
    });
    check("org A can create a customer", cust.status === 201, cust.body);
    const custId = cust.body?.data?.id;

    const txn = await call("transactions/", "POST", orgA.token, {
      trans_type: "SI", cash_debit: "D", bill_no: `BILL-${stamp}`, date: new Date().toISOString(),
      customer_id: custId, final_amount: 118, isGSTBill: 0,
      expenses: [{ key: "discount", amount: 0 }, { key: "roundoff", amount: 0 }],
      items: [{ product_id: prodId, qty: 1, rate: 100, taxable_amount: 100, CGST: 9, SGST: 9 }],
    });
    check("org A can create a transaction", txn.status === 201, txn.body);
    const tid = txn.body?.data?.transaction_id;

    // ── positive control: org A can read its own data ────────────────────
    const ownCat = await call(`categories/${catId}`, "GET", orgA.token);
    check("org A can read its own category", ownCat.status === 200);

    // ── org B must not be able to read any of it ─────────────────────────
    const crossCat = await call(`categories/${catId}`, "GET", orgB.token);
    check("org B cannot read org A's category by id (404)", crossCat.status === 404, crossCat.body);

    const crossCatList = await call("categories/", "GET", orgB.token);
    check("org B's category list does not contain org A's category",
      !(crossCatList.body?.data || []).some(c => c.id === catId));

    const crossProd = await call(`products/${prodId}`, "GET", orgB.token);
    check("org B cannot read org A's product by id (404)", crossProd.status === 404, crossProd.body);

    const crossProdList = await call("products/", "GET", orgB.token);
    check("org B's product list does not contain org A's product",
      !(crossProdList.body?.data || []).some(p => p.id === prodId));

    const crossCust = await call(`customers/${custId}`, "GET", orgB.token);
    check("org B cannot read org A's customer by id (404)", crossCust.status === 404, crossCust.body);

    const crossCustList = await call("customers/", "GET", orgB.token);
    check("org B's customer list does not contain org A's customer",
      !(crossCustList.body?.data || []).some(c => c.id === custId));

    const crossTxn = await call(`transactions/${tid}`, "GET", orgB.token);
    check("org B cannot read org A's transaction by id (404)", crossTxn.status === 404, crossTxn.body);

    const crossTxnList = await call("transactions/", "GET", orgB.token);
    check("org B's transaction list does not contain org A's transaction",
      !(crossTxnList.body?.data || []).some(t => t.transaction_id === tid));

    // ── org B's aggregates must be zero, not polluted by org A's data ────
    const statsB = await call("dashboard/stats", "GET", orgB.token);
    check("org B dashboard totalProducts is 0", statsB.body?.data?.totalProducts === 0, statsB.body);
    check("org B dashboard totalCustomers is 0", statsB.body?.data?.totalCustomers === 0, statsB.body);
    check("org B dashboard totalBills is 0", statsB.body?.data?.totalBills === 0, statsB.body);

    const summaryB = await call("reports/accounts/summary", "GET", orgB.token);
    check("org B account summary total_sales is 0", summaryB.body?.total_sales === 0, summaryB.body);

    const finB = await call("reports/financial", "GET", orgB.token);
    check("org B financial report sales_revenue is 0", finB.body?.data?.pl?.sales_revenue === 0, finB.body);

    // ── org B must not be able to mutate org A's rows ────────────────────
    const crossPut = await call(`customers/${custId}`, "PUT", orgB.token, { name: "Hijacked", opening: 0 });
    check("org B cannot update org A's customer (404)", crossPut.status === 404, crossPut.body);

    const crossDelete = await call(`products/${prodId}`, "DELETE", orgB.token);
    check("org B cannot delete org A's product (404)", crossDelete.status === 404, crossDelete.body);

    // ── org B must not be able to create a bill against org A's customer ─
    const crossTxnCreate = await call("transactions/", "POST", orgB.token, {
      trans_type: "SI", cash_debit: "D", bill_no: `HACK-${stamp}`, date: new Date().toISOString(),
      customer_id: custId, final_amount: 50, isGSTBill: 0,
      expenses: [{ key: "discount", amount: 0 }, { key: "roundoff", amount: 0 }],
      items: [{ product_id: prodId, qty: 1, rate: 50, taxable_amount: 50, CGST: 0, SGST: 0 }],
    });
    check("org B cannot create a bill against org A's customer/product (400)",
      crossTxnCreate.status === 400, crossTxnCreate.body);

  } finally {
    await cleanupAccount(`isolation_%_${stamp}@example.com`);
  }

  console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} CHECK(S) FAILED`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch(e => {
  console.error("Isolation test crashed:", e);
  process.exit(1);
});
