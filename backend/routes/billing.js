// Razorpay billing — Section 7 of the plan doc.
//
// Deliberately NOT behind requireActiveSubscription: a blocked account must
// still be able to reach these routes to pay its way back to active.
//
// /billing/webhook is the source of truth. /billing/verify only checks the
// browser's success-callback signature so the UI can react immediately —
// it never itself flips a subscription to 'active'.
const router = require("express").Router();
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const pool = require("../config/db");
const auth = require("../middleware/AuthMiddleware");
const { createSubscription } = require("../utils/razorpay");

const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

// Razorpay can legitimately send bursts of retries across many merchants —
// a generous per-IP limit here is just abuse protection, not meant to ever
// bind on real traffic.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/billing/plans — every active tier, for the Plans page. Reachable
// even when blocked (not behind requireActiveSubscription) so a blocked
// account can actually see what to upgrade to.
router.get("/billing/plans", auth, async (req, res) => {
  // #swagger.tags = ['Billing']
  try {
    const [rows] = await pool.query(
      "SELECT id, code, name, price_inr, billing_interval, max_orgs, max_users, features FROM plan WHERE is_active = 1 ORDER BY price_inr ASC"
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/billing/subscribe  { plan_id }
router.post("/billing/subscribe", auth, billingLimiter, async (req, res) => {
  // #swagger.tags = ['Billing']
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ success: false, message: "plan_id is required" });

  try {
    const [[plan]] = await pool.query("SELECT * FROM plan WHERE id = ? AND is_active = 1", [plan_id]);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    if (!plan.provider_plan_id)
      return res.status(500).json({ success: false, message: "This plan isn't linked to a payment provider yet" });

    // Razorpay subscriptions need a finite total_count even for what's
    // meant to auto-renew indefinitely — 10 years' worth of cycles either
    // way is a practical stand-in for "no fixed end".
    const totalCount = plan.billing_interval === "monthly" ? 120 : 10;

    const rzSub = await createSubscription({
      planId: plan.provider_plan_id,
      totalCount,
      notes: { account_id: String(req.user.aid), plan_code: plan.code },
    });

    // Doesn't touch `status` on an existing row — only the webhook flips
    // that, once the payment is actually confirmed.
    await pool.query(
      `INSERT INTO subscription (account_id, plan_id, status, provider, provider_sub_id)
       VALUES (?,?,'trialing',?,?)
       ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id), provider = VALUES(provider), provider_sub_id = VALUES(provider_sub_id)`,
      [req.user.aid, plan.id, "razorpay", rzSub.id]
    );

    res.json({
      success: true,
      data: {
        subscriptionId: rzSub.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        planName: plan.name,
        amount: plan.price_inr,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.response?.data?.error?.description || e.message });
  }
});

// POST /api/billing/verify  { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
// Client success-callback check only — see file header. Webhook is authoritative.
router.post("/billing/verify", auth, billingLimiter, async (req, res) => {
  // #swagger.tags = ['Billing']
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature)
    return res.status(400).json({ success: false, message: "Missing verification fields" });

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest("hex");

  if (expected !== razorpay_signature)
    return res.status(400).json({ success: false, message: "Payment verification failed" });

  res.json({ success: true, message: "Payment verified — activating your subscription." });
});

// Builds a stable dedupe key from a webhook payload: same delivery retried
// by Razorpay always yields the same key, but subscription.charged and
// payment.captured for the same underlying payment stay distinct (we only
// act on subscription.charged — see the note below — so that's fine).
function webhookEventId(body) {
  const p = body.payload || {};
  const entityId = p.payment?.entity?.id || p.subscription?.entity?.id || p.order?.entity?.id || "unknown";
  return `${body.event}:${entityId}`;
}

async function recordPayment(conn, { accountId, subscriptionRowId, amountInr, status, providerPaymentId, providerOrderId }) {
  const [r] = await conn.query(
    `INSERT INTO payment (account_id, subscription_id, amount_inr, status, provider, provider_order_id, provider_payment_id, paid_at)
     VALUES (?,?,?,?,'razorpay',?,?,?)`,
    [accountId, subscriptionRowId, amountInr, status, providerOrderId || null, providerPaymentId || null, status === "captured" ? new Date() : null]
  );
  if (status === "captured") {
    const invoiceNo = `INV-${String(r.insertId).padStart(6, "0")}`;
    await conn.query("UPDATE payment SET invoice_no = ? WHERE id = ?", [invoiceNo, r.insertId]);
    return invoiceNo;
  }
  return null;
}

// POST /api/billing/webhook — no `auth`; Razorpay calls this directly.
// Must read the RAW body for signature verification — wired via
// express.json's `verify` callback in server.js (req.rawBody), mounted
// before this route so the buffer is available here.
router.post("/billing/webhook", webhookLimiter, async (req, res) => {
  // #swagger.tags = ['Billing']
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set — refusing to process webhook");
    return res.status(503).json({ success: false, message: "Webhook not configured" });
  }

  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody || Buffer.from("")).digest("hex");
  if (!signature || signature !== expected)
    return res.status(400).json({ success: false, message: "Invalid webhook signature" });

  const body = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    try {
      await conn.query("INSERT INTO webhook_event (provider, event_id) VALUES ('razorpay', ?)", [webhookEventId(body)]);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        await conn.rollback();
        conn.release();
        return res.json({ success: true, message: "Already processed" });
      }
      throw e;
    }

    if (body.event === "subscription.charged") {
      const subEntity = body.payload?.subscription?.entity;
      const payEntity = body.payload?.payment?.entity;
      if (subEntity) {
        const [[subRow]] = await conn.query("SELECT * FROM subscription WHERE provider_sub_id = ?", [subEntity.id]);
        if (subRow) {
          await conn.query(
            `UPDATE subscription SET status = 'active',
               current_period_start = FROM_UNIXTIME(?),
               current_period_end   = FROM_UNIXTIME(?)
             WHERE id = ?`,
            [subEntity.current_start, subEntity.current_end, subRow.id]
          );
          if (payEntity) {
            await recordPayment(conn, {
              accountId: subRow.account_id,
              subscriptionRowId: subRow.id,
              amountInr: payEntity.amount / 100,
              status: "captured",
              providerPaymentId: payEntity.id,
              providerOrderId: payEntity.order_id,
            });
          }
        }
      }
    } else if (body.event === "payment.failed") {
      const payEntity = body.payload?.payment?.entity;
      if (payEntity?.subscription_id) {
        const [[subRow]] = await conn.query("SELECT * FROM subscription WHERE provider_sub_id = ?", [payEntity.subscription_id]);
        if (subRow) {
          await conn.query("UPDATE subscription SET status = 'past_due' WHERE id = ?", [subRow.id]);
          await recordPayment(conn, {
            accountId: subRow.account_id,
            subscriptionRowId: subRow.id,
            amountInr: (payEntity.amount || 0) / 100,
            status: "failed",
            providerPaymentId: payEntity.id,
            providerOrderId: payEntity.order_id,
          });
        }
      }
    } else if (body.event === "subscription.cancelled") {
      const subEntity = body.payload?.subscription?.entity;
      if (subEntity) {
        await conn.query("UPDATE subscription SET status = 'canceled' WHERE provider_sub_id = ?", [subEntity.id]);
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (e) {
    await conn.rollback();
    console.error("webhook processing error:", e);
    res.status(500).json({ success: false, message: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
