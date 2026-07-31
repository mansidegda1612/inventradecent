// Platform console — the SaaS owner's own screens, mounted at /api/platform/*.
//
// Scope (deliberately small for now): see every customer account and its plan,
// onboard a customer by hand, and approve/extend a subscription for someone who
// paid in cash instead of through Razorpay. Reporting comes later.
//
// Not behind loadContext (a platform admin has no oid) and not behind
// requireActiveSubscription (it isn't a tenant and has nothing to subscribe to).
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const auth = require("../middleware/AuthMiddleware");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const { computeEffectiveStatus } = require("../utils/subscriptionStatus");
const { sendMail } = require("../utils/mailer");

// Path-scoped, NOT a blanket `router.use(auth, requirePlatformAdmin)`.
//
// This router is mounted at the generic "/api/" prefix (see server.js), so
// unscoped middleware here runs on every /api/* request on its way to the
// routers mounted after it. requirePlatformAdmin *terminates* the request with a
// 404 for anyone who isn't the platform admin — which is every tenant — so
// leaving it unscoped 404s the entire rest of the API. `auth` and
// requireActiveSubscription get away with being blanket in the other routers
// only because they call next() for a valid tenant.
//
// Same fix already used by dashboard.js:14 and accountReports.js:33.
router.use("/platform", auth, requirePlatformAdmin);

const OWNER_ROLE_ID = 1; // seeded "admin" role — rights = ["*"], same as signup uses
const PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "cheque", "other"];

// ── date helpers ────────────────────────────────────────────────────────────
// The UI sends plain YYYY-MM-DD from <input type="date">. A period that "ends
// on the 25th" has to stay usable for all of the 25th, so end dates land at
// 23:59:59 — otherwise computeEffectiveStatus() flips the account to read-only
// at midnight *starting* that day, a full day early.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(dateStr) {
  return `${dateStr} 00:00:00`;
}
function endOfDay(dateStr) {
  return `${dateStr} 23:59:59`;
}
function badDate(dateStr) {
  return !dateStr || !DATE_RE.test(dateStr) || Number.isNaN(new Date(`${dateStr}T00:00:00`).getTime());
}
// For the confirmation messages/emails. The stored form ("2027-07-24 23:59:59")
// isn't ISO-8601, and parsing it is implementation-defined — swap in the T so
// new Date() is reading a shape it's actually specified to handle.
function humanDate(dbDateTime) {
  return new Date(String(dbDateTime).replace(" ", "T")).toDateString();
}

// ── audit ───────────────────────────────────────────────────────────────────
// Called inside the same transaction as the change it describes, so an audit
// row can never survive a rolled-back grant (or vice versa).
async function audit(conn, req, { action, accountId = null, detail = null }) {
  await conn.query(
    "INSERT INTO platform_audit (actor_user_id, action, target_account_id, detail, ip) VALUES (?,?,?,?,?)",
    [req.user.id, action, accountId, detail ? JSON.stringify(detail) : null, req.ip || null]
  );
}

// Mirrors billing.js's recordPayment() so a cash receipt and a Razorpay receipt
// end up as the same shape of row — including the invoice_no series.
async function recordManualPayment(conn, { accountId, subscriptionRowId, payment, actorUserId }) {
  const method = PAYMENT_METHODS.includes(payment.method) ? payment.method : "other";
  const paidAt = payment.paid_at && !badDate(payment.paid_at) ? startOfDay(payment.paid_at) : new Date();

  const [r] = await conn.query(
    `INSERT INTO payment (account_id, subscription_id, amount_inr, status, method, provider,
                          reference, note, recorded_by, paid_at)
     VALUES (?,?,?, 'captured', ?, 'manual', ?,?,?,?)`,
    [accountId, subscriptionRowId, payment.amount_inr, method,
     payment.reference || null, payment.note || null, actorUserId, paidAt]
  );
  const invoiceNo = `INV-${String(r.insertId).padStart(6, "0")}`;
  await conn.query("UPDATE payment SET invoice_no = ? WHERE id = ?", [invoiceNo, r.insertId]);
  return { id: r.insertId, invoiceNo };
}

// Shared validation for the subscription half of both create-customer and
// approve-subscription, so the two can't drift apart on what a valid grant is.
// Returns { error } or { sub: {...ready-to-write values} }.
async function resolveSubscriptionInput(body) {
  const mode = body.mode === "trial" ? "trial" : "paid";

  if (mode === "trial") {
    if (badDate(body.trial_ends_at))
      return { error: "trial_ends_at must be a YYYY-MM-DD date" };
    return {
      sub: {
        mode, planId: null, status: "trialing",
        trialEndsAt: endOfDay(body.trial_ends_at),
        periodStart: null, periodEnd: null,
      },
    };
  }

  if (!body.plan_id) return { error: "plan_id is required for a paid subscription" };
  if (badDate(body.period_start)) return { error: "period_start must be a YYYY-MM-DD date" };
  if (badDate(body.period_end)) return { error: "period_end must be a YYYY-MM-DD date" };
  if (new Date(body.period_end) < new Date(body.period_start))
    return { error: "period_end cannot be before period_start" };

  const [[plan]] = await pool.query(
    "SELECT id, name, code, price_inr, billing_interval FROM plan WHERE id = ? AND is_active = 1",
    [body.plan_id]
  );
  if (!plan) return { error: "Plan not found (or not active)" };

  return {
    sub: {
      mode, planId: plan.id, plan, status: "active",
      trialEndsAt: null,
      periodStart: startOfDay(body.period_start),
      periodEnd: endOfDay(body.period_end),
    },
  };
}

// Validation for the optional "money received" block. Only meaningful on a paid
// grant — a trial has nothing to receive.
function resolvePaymentInput(body, sub) {
  if (!body.payment) return { payment: null };
  if (sub.mode !== "paid") return { error: "A payment can only be recorded against a paid plan" };

  const amount = Number(body.payment.amount_inr);
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "payment.amount_inr must be a positive number" };

  return { payment: { ...body.payment, amount_inr: amount } };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/platform/plans — the plan catalog, for the plan dropdown.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/platform/plans", async (req, res) => {
  // #swagger.tags = ['Platform']
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, price_inr, billing_interval, max_orgs, max_users, features
       FROM plan WHERE is_active = 1 ORDER BY billing_interval DESC, price_inr ASC`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/platform/accounts — every customer, its plan, and the headline counts.
//
// Returns the list and the summary tiles together: both are derived from the
// same rows, and the "expired/past due" tallies depend on computeEffectiveStatus
// (a JS function, not a column), so counting them in SQL would mean a second,
// divergent implementation of the same rule.
//
// Reads metadata only — account/subscription/plan plus row counts. Never the
// customers' own business data (invoices, ledgers, products).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/platform/accounts", async (req, res) => {
  // #swagger.tags = ['Platform']
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.name, a.owner_email, a.status AS account_status, a.created_at,
              u.id   AS owner_user_id,
              u.name AS owner_name,
              u.phone AS owner_phone,
              -- Latest login by ANYONE on the account, not just the owner: it's
              -- the better staleness signal (a shop's staff log in daily, the
              -- owner may not for weeks) and it still resolves if the owner row
              -- can't be matched below.
              (SELECT MAX(last_login) FROM user WHERE account_id = a.id) AS last_login,
              s.id     AS subscription_id,
              s.status AS sub_status_raw,
              s.trial_ends_at, s.current_period_start, s.current_period_end,
              s.provider, s.provider_sub_id,
              p.id AS plan_id, p.name AS plan_name, p.code AS plan_code,
              p.price_inr, p.billing_interval,
              (SELECT COUNT(*) FROM user         WHERE account_id = a.id) AS user_count,
              (SELECT COUNT(*) FROM organization WHERE account_id = a.id) AS org_count,
              (SELECT COALESCE(SUM(amount_inr), 0) FROM payment
                 WHERE account_id = a.id AND status = 'captured')         AS paid_total
       FROM account a
       LEFT JOIN subscription s ON s.account_id = a.id
       LEFT JOIN plan p         ON p.id = s.plan_id
       -- The owner login — signup (and POST /platform/accounts) sets
       -- user.user_id = account.owner_email. Kept as a plain equality join
       -- because this database is TiDB, which rejects subqueries in an ON
       -- clause ("ON condition doesn't support subqueries yet").
       LEFT JOIN user u         ON u.account_id = a.id AND u.user_id = a.owner_email
       ORDER BY a.created_at DESC`
    );

    const accounts = rows.map((r) => ({
      ...r,
      // The stored status is only half the truth — a row can say 'active' with a
      // period_end in the past. This is the same value the tenant side enforces.
      sub_status: computeEffectiveStatus(
        r.subscription_id
          ? {
              status: r.sub_status_raw,
              trial_ends_at: r.trial_ends_at,
              current_period_end: r.current_period_end,
            }
          : null
      ),
      // Manual = paid me directly; there is no auto-charge behind it, so these
      // are the ones that silently lapse if nobody renews them by hand.
      is_manual: r.provider === "manual" || (r.plan_id != null && !r.provider_sub_id),
    }));

    const countBy = (status) => accounts.filter((a) => a.sub_status === status).length;
    const summary = {
      total: accounts.length,
      trialing: countBy("trialing"),
      active: countBy("active"),
      lapsed: accounts.filter((a) => ["expired", "past_due", "canceled"].includes(a.sub_status)).length,
      paying: accounts.filter((a) => a.sub_status === "active" && a.plan_id != null).length,
    };

    res.json({ success: true, data: { accounts, summary } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/platform/accounts — onboard a customer by hand.
//
// Same end state as a self-service /auth/signup (account + owner user + first
// organization + subscription + org access, one transaction), except the plan
// and the dates are whatever I choose — which is the point for someone who
// handed me cash and never touched Razorpay.
//
// Body: { name, email, phone, password, business_name,
//         mode: 'trial' | 'paid',
//         trial_ends_at              (mode=trial)
//         plan_id, period_start, period_end   (mode=paid)
//         payment: { amount_inr, method, reference, note, paid_at } | null
//         send_welcome_email, note }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/platform/accounts", async (req, res) => {
  // #swagger.tags = ['Platform']
  const { name, email, phone, password, business_name } = req.body;

  if (!name || !email || !phone || !password || !business_name)
    return res.status(400).json({
      success: false,
      message: "name, email, phone, password and business_name are required",
    });
  if (password.length < 6)
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

  const { sub, error: subError } = await resolveSubscriptionInput(req.body);
  if (subError) return res.status(400).json({ success: false, message: subError });

  const { payment, error: payError } = resolvePaymentInput(req.body, sub);
  if (payError) return res.status(400).json({ success: false, message: payError });

  try {
    // Same three uniqueness checks /auth/signup makes — a customer onboarded
    // here has to be able to log in through the normal front door afterwards.
    const [[dupAccount]] = await pool.query("SELECT id FROM account WHERE owner_email = ?", [email]);
    if (dupAccount)
      return res.status(409).json({ success: false, message: "An account with this email already exists" });

    const [[dupUser]] = await pool.query("SELECT id FROM user WHERE user_id = ?", [email]);
    if (dupUser)
      return res.status(409).json({ success: false, message: "A login with this email already exists" });

    const [[dupPhone]] = await pool.query("SELECT id FROM user WHERE phone = ?", [phone]);
    if (dupPhone)
      return res.status(409).json({ success: false, message: "A login with this phone number already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    let accountId, userId, orgId, subscriptionId, invoiceNo = null;

    try {
      await conn.beginTransaction();

      const [accountResult] = await conn.query(
        "INSERT INTO account (name, owner_email, status) VALUES (?,?,'active')",
        [business_name, email]
      );
      accountId = accountResult.insertId;

      const [userResult] = await conn.query(
        `INSERT INTO user (user_id, email, phone, password, name, userrole, is_active, account_id)
         VALUES (?,?,?,?,?,?,1,?)`,
        [email, email, phone, hashed, name, OWNER_ROLE_ID, accountId]
      );
      userId = userResult.insertId;

      const [orgResult] = await conn.query(
        "INSERT INTO organization (account_id, name, status) VALUES (?,?,'active')",
        [accountId, business_name]
      );
      orgId = orgResult.insertId;

      const [subResult] = await conn.query(
        `INSERT INTO subscription (account_id, plan_id, status, trial_ends_at,
                                   current_period_start, current_period_end, provider)
         VALUES (?,?,?,?,?,?,?)`,
        [accountId, sub.planId, sub.status, sub.trialEndsAt,
         sub.periodStart, sub.periodEnd, sub.mode === "paid" ? "manual" : null]
      );
      subscriptionId = subResult.insertId;

      await conn.query(
        "INSERT INTO user_org_access (user_id, org_id, userrole) VALUES (?,?,?)",
        [userId, orgId, OWNER_ROLE_ID]
      );

      if (payment) {
        ({ invoiceNo } = await recordManualPayment(conn, {
          accountId, subscriptionRowId: subscriptionId, payment, actorUserId: req.user.id,
        }));
      }

      await audit(conn, req, {
        action: "account.create",
        accountId,
        detail: {
          business_name, owner_email: email, owner_phone: phone,
          mode: sub.mode, plan_id: sub.planId, plan_name: sub.plan?.name || null,
          status: sub.status, trial_ends_at: sub.trialEndsAt,
          period_start: sub.periodStart, period_end: sub.periodEnd,
          payment: payment ? { ...payment, invoice_no: invoiceNo } : null,
          note: req.body.note || null,
        },
      });

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Best-effort, exactly like /auth/signup's welcome mail — the account is
    // already committed and a mail hiccup mustn't turn that into a failure.
    if (req.body.send_welcome_email !== false) {
      try {
        await sendMail({
          to: email,
          subject: "Your InventraDecent account is ready",
          text:
            `Hi ${name},\n\n` +
            `Your InventraDecent account for "${business_name}" is set up and ready to use.\n\n` +
            `Login id: ${email}\n` +
            `(You can also sign in with your phone number, ${phone}.)\n\n` +
            (sub.mode === "paid"
              ? `Plan: ${sub.plan.name} — valid through ${humanDate(sub.periodEnd)}.\n\n`
              : `You're on a free trial through ${humanDate(sub.trialEndsAt)}.\n\n`) +
            `Please change your password after your first sign-in.\n\n` +
            `Thanks for choosing InventraDecent!\n`,
        });
      } catch (e) {
        console.error("Failed to send onboarding email:", e.message);
      }
    }

    res.status(201).json({
      success: true,
      message: "Customer created",
      data: { account_id: accountId, user_id: userId, org_id: orgId, invoice_no: invoiceNo },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/platform/accounts/:id/subscription — approve / set a plan.
//
// This is the cash-approval action: pick the plan, pick the start and end
// dates, optionally record the money received. On the next login the customer
// gets the full app, because computeEffectiveStatus() reads 'active' plus a
// current_period_end in the future. When that date passes, the same function
// locks the account on its own — no cron job involved (staff are refused a
// login, the owner is left with Plans & Billing; see utils/accessGate.js).
//
// `subscription` has UNIQUE KEY uq_sub_account, so this is an update-in-place
// of the account's one row.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/platform/accounts/:id/subscription", async (req, res) => {
  // #swagger.tags = ['Platform']
  const accountId = req.params.id;

  const { sub, error: subError } = await resolveSubscriptionInput(req.body);
  if (subError) return res.status(400).json({ success: false, message: subError });

  const { payment, error: payError } = resolvePaymentInput(req.body, sub);
  if (payError) return res.status(400).json({ success: false, message: payError });

  try {
    const [[account]] = await pool.query("SELECT id, name, owner_email FROM account WHERE id = ?", [accountId]);
    if (!account) return res.status(404).json({ success: false, message: "Account not found" });

    const [[existing]] = await pool.query("SELECT * FROM subscription WHERE account_id = ?", [accountId]);

    // Overwriting a live Razorpay subscription would leave Razorpay charging the
    // customer's card on a schedule this row no longer describes, and the
    // webhook would no longer find it by provider_sub_id — so the two would
    // silently diverge and the customer could be billed twice. Cancel at
    // Razorpay first, or pass force_override to accept that.
    if (existing?.provider === "razorpay" && existing.provider_sub_id && !req.body.force_override) {
      return res.status(409).json({
        success: false,
        code: "RAZORPAY_SUBSCRIPTION_ACTIVE",
        message:
          `This account has a live Razorpay subscription (${existing.provider_sub_id}). ` +
          "Cancel it in Razorpay first, otherwise the customer keeps getting auto-charged. " +
          "Re-submit with force_override to override anyway.",
        data: { provider_sub_id: existing.provider_sub_id },
      });
    }

    const conn = await pool.getConnection();
    let subscriptionId, invoiceNo = null;
    try {
      await conn.beginTransaction();

      if (existing) {
        subscriptionId = existing.id;
        await conn.query(
          `UPDATE subscription
              SET plan_id = ?, status = ?, trial_ends_at = ?,
                  current_period_start = ?, current_period_end = ?,
                  provider = ?, provider_sub_id = NULL
            WHERE id = ?`,
          [sub.planId, sub.status, sub.trialEndsAt, sub.periodStart, sub.periodEnd,
           sub.mode === "paid" ? "manual" : null, existing.id]
        );
      } else {
        const [r] = await conn.query(
          `INSERT INTO subscription (account_id, plan_id, status, trial_ends_at,
                                     current_period_start, current_period_end, provider)
           VALUES (?,?,?,?,?,?,?)`,
          [accountId, sub.planId, sub.status, sub.trialEndsAt,
           sub.periodStart, sub.periodEnd, sub.mode === "paid" ? "manual" : null]
        );
        subscriptionId = r.insertId;
      }

      if (payment) {
        ({ invoiceNo } = await recordManualPayment(conn, {
          accountId, subscriptionRowId: subscriptionId, payment, actorUserId: req.user.id,
        }));
      }

      await audit(conn, req, {
        action: "subscription.set",
        accountId,
        detail: {
          before: existing
            ? {
                plan_id: existing.plan_id, status: existing.status,
                trial_ends_at: existing.trial_ends_at,
                current_period_start: existing.current_period_start,
                current_period_end: existing.current_period_end,
                provider: existing.provider, provider_sub_id: existing.provider_sub_id,
              }
            : null,
          after: {
            plan_id: sub.planId, plan_name: sub.plan?.name || null, status: sub.status,
            trial_ends_at: sub.trialEndsAt,
            current_period_start: sub.periodStart, current_period_end: sub.periodEnd,
            provider: sub.mode === "paid" ? "manual" : null,
          },
          forced_over_razorpay: !!(existing?.provider_sub_id && req.body.force_override),
          payment: payment ? { ...payment, invoice_no: invoiceNo } : null,
          note: req.body.note || null,
        },
      });

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    res.json({
      success: true,
      message: sub.mode === "paid"
        ? `${account.name} is now on ${sub.plan.name} through ${humanDate(sub.periodEnd)}`
        : `${account.name} is on trial through ${humanDate(sub.trialEndsAt)}`,
      data: { subscription_id: subscriptionId, invoice_no: invoiceNo },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
