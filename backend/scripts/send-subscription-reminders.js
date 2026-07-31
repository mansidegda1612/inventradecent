// Sends today's trial / subscription expiry reminder emails, then exits.
//
// The web process already does this daily on its own
// (utils/reminderScheduler.js). This script is for running it from an OS
// scheduler instead — set REMINDER_SCHEDULER=off in .env so the two don't both
// try, and add one of:
//
//   Linux cron (09:00 daily):
//     0 9 * * * cd /path/to/backend && /usr/bin/node scripts/send-subscription-reminders.js >> logs/reminders.log 2>&1
//
//   Windows Task Scheduler (daily at 09:00):
//     schtasks /create /tn "InventraDecent reminders" /tr "node D:\path\backend\scripts\send-subscription-reminders.js" /sc daily /st 09:00
//
// Safe to run by hand at any time, and safe to run twice: each reminder is
// claimed in `subscription_reminder` before it's mailed, so a second run just
// reports them as already-sent.
//
// Usage: node scripts/send-subscription-reminders.js [--dry-run]
//   --dry-run  list what would be mailed and change nothing (no rows written,
//              no email sent) — worth doing once against real data.
require("dotenv").config();
const pool = require("../config/db");
const { sendSubscriptionReminders } = require("../utils/subscriptionReminders");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("DRY RUN — no emails will be sent and nothing will be recorded.\n");

  const started = Date.now();
  const stats = await sendSubscriptionReminders({ dryRun });
  console.log(
    `Done in ${Date.now() - started}ms — ` +
    `${stats.considered} active account(s) checked, ${stats.due} reminder(s) due, ` +
    `${stats.sent} ${dryRun ? "would be sent" : "sent"}, ${stats.skipped} already sent, ${stats.failed} failed.`
  );
  // A non-zero exit makes a failure visible to cron / Task Scheduler instead of
  // hiding it in a log nobody reads.
  return stats.failed > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await pool.end();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error("Reminder run failed:", e);
    await pool.end();
    process.exit(1);
  });
