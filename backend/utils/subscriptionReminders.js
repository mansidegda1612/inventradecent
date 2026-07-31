// Trial / subscription expiry reminder emails.
//
// Runs once a day (utils/reminderScheduler.js in-process, or
// scripts/send-subscription-reminders.js from an OS cron) and mails the
// account owner when their countdown hits a milestone:
//
//   trial        →  5, 3, 1 days left
//   subscription → 10, 5, 3, 1 days left
//
// Milestones are matched on whole calendar days (DATEDIFF against CURDATE()),
// not on hours, so "3 days left" means the same thing no matter what time of
// day the job happens to run.
//
// Every send is claimed in `subscription_reminder` (UNIQUE on
// account_id + kind + days_before + target_date) BEFORE the mail goes out, so a
// restart, a second app instance, or a manual re-run can't double-mail the
// customer. If the send then fails, the claim is released so the next run
// retries it. See database/migrations/009_subscription_reminders.sql.
const pool = require("../config/db");
const { sendMail } = require("./mailer");

const TRIAL_MILESTONES = [5, 3, 1];
const SUBSCRIPTION_MILESTONES = [10, 5, 3, 1];

function humanDate(dbDate) {
  return new Date(String(dbDate).replace(" ", "T")).toDateString();
}

// "in 3 days" / "tomorrow" — reads naturally in both a subject line and a
// sentence, and avoids the awkward "ends in 1 days".
function inDays(days) {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// Accounts whose owner never filled in a real address (e.g. the
// 'REPLACE_WITH_OWNER_EMAIL' placeholder migration 001 seeds for the founding
// account) are skipped rather than handed to the SMTP server as a hard bounce.
const CANDIDATES_SQL = `
  SELECT a.id            AS account_id,
         a.name          AS account_name,
         a.owner_email,
         u.name          AS owner_name,
         s.status        AS sub_status,
         s.provider,
         p.name          AS plan_name,
         DATE_FORMAT(s.trial_ends_at,      '%Y-%m-%d') AS trial_end_date,
         DATE_FORMAT(s.current_period_end, '%Y-%m-%d') AS period_end_date,
         DATEDIFF(DATE(s.trial_ends_at),      CURDATE()) AS trial_days_left,
         DATEDIFF(DATE(s.current_period_end), CURDATE()) AS period_days_left
    FROM subscription s
    JOIN account a  ON a.id = s.account_id
    LEFT JOIN plan p ON p.id = s.plan_id
    -- The owner login, purely to personalise the greeting — signup and
    -- POST /platform/accounts both set user.user_id AND user.email to
    -- account.owner_email, but older/hand-edited rows only match on one of the
    -- two, so try both rather than falling back to "Hi there" unnecessarily.
    -- Plain equality (no subquery) because this database is TiDB, which
    -- rejects subqueries in an ON clause.
    LEFT JOIN user u ON u.account_id = a.id
                    AND (u.user_id = a.owner_email OR u.email = a.owner_email)
   WHERE a.status = 'active'
     AND a.owner_email LIKE '%@%'
     AND s.status IN ('trialing', 'active')
`;

function buildTrialReminderEmail({ ownerName, accountName, daysLeft, endDate }) {
  const when = inDays(daysLeft);
  return {
    subject: `Your InventraDecent trial ends ${when}`,
    text:
      `Hi ${ownerName || "there"},\n\n` +
      `Your free trial for "${accountName}" ends ${when} — on ${humanDate(endDate)}.\n\n` +
      `When the trial ends, sign-in is paused for your team until a plan is active. ` +
      `Nothing is deleted: your products, invoices and ledgers stay exactly as they are ` +
      `and come straight back the moment you subscribe.\n\n` +
      `To keep working without a break:\n` +
      `  1. Sign in to InventraDecent\n` +
      `  2. Open Plans & Billing from the account menu (top right)\n` +
      `  3. Pick the plan that fits your business\n\n` +
      `Plans start small and can be changed later, so there's no need to over-commit now.\n\n` +
      `If you have questions about which plan to pick, just reply to this email.\n\n` +
      `— The InventraDecent team\n`,
  };
}

function buildSubscriptionReminderEmail({ ownerName, accountName, planName, daysLeft, endDate, autoRenews }) {
  const when = inDays(daysLeft);
  const plan = planName ? `${planName} subscription` : "subscription";
  return {
    subject: autoRenews
      ? `Your InventraDecent plan renews ${when}`
      : `Your InventraDecent subscription expires ${when}`,
    text:
      `Hi ${ownerName || "there"},\n\n` +
      (autoRenews
        ? `Your ${plan} for "${accountName}" renews automatically ${when}, on ${humanDate(endDate)}. ` +
          `No action needed — this is just so the charge isn't a surprise.\n\n` +
          `Please make sure the card/mandate on your account is still valid. If the payment ` +
          `doesn't go through, access is paused until it's settled.\n\n`
        : `Your ${plan} for "${accountName}" expires ${when}, on ${humanDate(endDate)}.\n\n` +
          `Once it expires, sign-in is paused for your team until the subscription is renewed. ` +
          `Your data isn't touched — it's all there again as soon as you renew.\n\n` +
          `To renew: sign in, open Plans & Billing from the account menu (top right), and ` +
          `choose your plan.\n\n`) +
      `Need a GST invoice, a different plan, or help with payment? Just reply to this email.\n\n` +
      `Thanks for using InventraDecent!\n`,
  };
}

// Claims the reminder row first — the INSERT is the lock. Returns false when
// this exact reminder has already been sent (or is being sent right now by
// another process), in which case the caller must not mail anything.
async function claimReminder({ accountId, kind, daysBefore, targetDate, sentTo }) {
  try {
    await pool.query(
      `INSERT INTO subscription_reminder (account_id, kind, days_before, target_date, sent_to)
       VALUES (?,?,?,?,?)`,
      [accountId, kind, daysBefore, targetDate, sentTo]
    );
    return true;
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return false;
    throw e;
  }
}

async function releaseReminder({ accountId, kind, daysBefore, targetDate }) {
  await pool.query(
    `DELETE FROM subscription_reminder
      WHERE account_id = ? AND kind = ? AND days_before = ? AND target_date = ?`,
    [accountId, kind, daysBefore, targetDate]
  );
}

/**
 * Sends every reminder that is due today.
 * Never throws for a single bad account — one tenant's broken email address
 * must not stop the other tenants' reminders from going out.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun] - report what would be sent and change
 *   nothing: no claim rows written, no mail sent. Useful for sanity-checking
 *   against real customer data before letting the job loose.
 * @returns {Promise<{considered:number, due:number, sent:number, skipped:number, failed:number}>}
 */
async function sendSubscriptionReminders({ dryRun = false } = {}) {
  const [allRows] = await pool.query(CANDIDATES_SQL);

  // `subscription` is unique per account, but the owner-name join can match
  // more than one user row (e.g. one matching on user_id, another on email).
  // One account gets one email, so collapse to the first row per account —
  // every column the email needs is identical across them bar owner_name.
  const byAccount = new Map();
  for (const row of allRows) {
    if (!byAccount.has(row.account_id)) byAccount.set(row.account_id, row);
  }
  const rows = [...byAccount.values()];

  const stats = { considered: rows.length, due: 0, sent: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    const isTrial = row.sub_status === "trialing";
    const daysLeft = isTrial ? row.trial_days_left : row.period_days_left;
    const targetDate = isTrial ? row.trial_end_date : row.period_end_date;
    const milestones = isTrial ? TRIAL_MILESTONES : SUBSCRIPTION_MILESTONES;

    if (daysLeft == null || !milestones.includes(daysLeft)) continue;
    stats.due++;

    const claim = {
      accountId: row.account_id,
      kind: isTrial ? "trial" : "subscription",
      daysBefore: daysLeft,
      targetDate,
      sentTo: row.owner_email,
    };

    if (dryRun) {
      const [[already]] = await pool.query(
        `SELECT sent_at FROM subscription_reminder
          WHERE account_id = ? AND kind = ? AND days_before = ? AND target_date = ?`,
        [claim.accountId, claim.kind, claim.daysBefore, claim.targetDate]
      );
      console.log(
        `[dry-run] ${already ? "ALREADY SENT" : "WOULD SEND"} ` +
        `${claim.kind} T-${daysLeft} → ${row.owner_email} ` +
        `(account ${row.account_id} "${row.account_name}", ${claim.kind} ends ${targetDate})`
      );
      if (already) stats.skipped++; else stats.sent++;
      continue;
    }

    try {
      if (!(await claimReminder(claim))) {
        stats.skipped++;
        continue;
      }
    } catch (e) {
      console.error(`[reminders] could not claim reminder for account ${row.account_id}:`, e.message);
      stats.failed++;
      continue;
    }

    const { subject, text } = isTrial
      ? buildTrialReminderEmail({
          ownerName: row.owner_name,
          accountName: row.account_name,
          daysLeft,
          endDate: targetDate,
        })
      : buildSubscriptionReminderEmail({
          ownerName: row.owner_name,
          accountName: row.account_name,
          planName: row.plan_name,
          daysLeft,
          endDate: targetDate,
          // A Razorpay subscription charges itself on the period boundary; a
          // 'manual' (cash/bank, recorded from the platform console) one has to
          // be renewed by hand, so the two need different asks.
          autoRenews: row.provider === "razorpay",
        });

    try {
      await sendMail({ to: row.owner_email, subject, text });
      stats.sent++;
      console.log(`[reminders] ${claim.kind} T-${daysLeft} → ${row.owner_email} (account ${row.account_id})`);
    } catch (e) {
      // Give the claim back so tomorrow's run tries again instead of the
      // customer silently never hearing about this milestone.
      console.error(`[reminders] send failed for account ${row.account_id} (${row.owner_email}):`, e.message);
      try {
        await releaseReminder(claim);
      } catch (delErr) {
        console.error(`[reminders] could not release claim for account ${row.account_id}:`, delErr.message);
      }
      stats.failed++;
    }
  }

  return stats;
}

module.exports = {
  sendSubscriptionReminders,
  TRIAL_MILESTONES,
  SUBSCRIPTION_MILESTONES,
  CANDIDATES_SQL,   // exported for ad-hoc "what would run today?" checks
  // Exported so the copy can be previewed/reviewed without waiting for a real
  // account to hit a milestone.
  buildTrialReminderEmail,
  buildSubscriptionReminderEmail,
};
