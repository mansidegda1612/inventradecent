// Every query against a business table (customer, product, category,
// `group`, transaction, transaction_items, transaction_adjustments,
// cashcustdetail) must be scoped by org_id, sourced from req.ctx (set by
// middleware/loadContext.js from the verified token) — never from the
// request body/query. This replaces the old `let where = "WHERE 1=1"`
// starting point so every route's base filter is org-scoped from the first
// line, and skipping it is an obvious diff in review.
//
// One deliberate exception: `group` also allows org_id IS NULL, which marks the
// shared system defaults ("customer"/"supplier") that every org sees but none
// may edit. routes/group.js reads `(org_id = ? OR org_id IS NULL)` for that
// reason — see migrations/008_system_groups.sql. Writes there are still plain
// org_id = ?, which is what keeps the system rows read-only.
//
//   const { orgScope } = require("../utils/orgScope");
//   const scope = orgScope(req.ctx, "c");       // alias optional
//   let where = scope.where;                     // "WHERE c.org_id = ?"
//   const params = [...scope.params];             // [req.ctx.orgId]
//   where += " AND ...";  params.push(...);
function orgScope(ctx, alias = "") {
  const col = alias ? `${alias}.org_id` : "org_id";
  return { where: `WHERE ${col} = ?`, params: [ctx.orgId] };
}

module.exports = { orgScope };
