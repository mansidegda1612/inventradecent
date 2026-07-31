// Daily in-process scheduler for the expiry reminder emails.
//
// Deliberately dependency-free (a setTimeout chain, not node-cron): the job
// runs once a day at a fixed local hour, which doesn't need a cron parser, and
// this repo has no scheduler infrastructure to build on yet.
//
// Two runs are triggered:
//   * a catch-up run shortly after boot, so a deploy or restart that happens
//     after the daily slot doesn't skip a day's reminders
//   * the daily run at REMINDER_HOUR:REMINDER_MINUTE local time
//
// Both are safe to overlap or repeat — sendSubscriptionReminders() claims each
// reminder in the database before mailing, so nothing is ever sent twice.
//
// Prefer an OS cron / Task Scheduler entry calling
// `node scripts/send-subscription-reminders.js` if you'd rather keep scheduling
// outside the web process; set REMINDER_SCHEDULER=off in that case.
const { sendSubscriptionReminders } = require("./subscriptionReminders");

const BOOT_DELAY_MS = 30 * 1000;  // let the DB pool and the rest of boot settle
const DAY_MS = 24 * 60 * 60 * 1000;

function msUntilNextRun(hour, minute, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY_MS);
  return next.getTime() - now.getTime();
}

async function runOnce(label) {
  try {
    const stats = await sendSubscriptionReminders();
    console.log(
      `[reminders] ${label} run complete — considered ${stats.considered}, due ${stats.due}, ` +
      `sent ${stats.sent}, already-sent ${stats.skipped}, failed ${stats.failed}`
    );
  } catch (e) {
    // Never let a bad run take the web process down with it — reminders are
    // best-effort, and tomorrow's run picks up whatever was missed.
    console.error(`[reminders] ${label} run failed:`, e.message);
  }
}

function startReminderScheduler() {
  if (String(process.env.REMINDER_SCHEDULER || "").toLowerCase() === "off") {
    console.log("[reminders] in-process scheduler disabled (REMINDER_SCHEDULER=off)");
    return;
  }

  const hour = Number.isInteger(parseInt(process.env.REMINDER_HOUR, 10))
    ? Math.min(23, Math.max(0, parseInt(process.env.REMINDER_HOUR, 10)))
    : 9;
  const minute = Number.isInteger(parseInt(process.env.REMINDER_MINUTE, 10))
    ? Math.min(59, Math.max(0, parseInt(process.env.REMINDER_MINUTE, 10)))
    : 0;

  const bootTimer = setTimeout(() => runOnce("catch-up"), BOOT_DELAY_MS);
  bootTimer.unref?.();

  // Re-derive the delay after every run rather than using a fixed 24h
  // setInterval, so the slot doesn't drift with DST or a long-running job.
  const scheduleNext = () => {
    const delay = msUntilNextRun(hour, minute);
    const timer = setTimeout(async () => {
      await runOnce("daily");
      scheduleNext();
    }, delay);
    timer.unref?.();
    return delay;
  };

  const firstDelay = scheduleNext();
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  console.log(
    `[reminders] scheduler on — daily at ${hh}:${mm} local ` +
    `(next in ${Math.round(firstDelay / 60000)} min)`
  );
}

module.exports = { startReminderScheduler, msUntilNextRun };
