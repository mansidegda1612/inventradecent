// Real mail delivery via Nodemailer (SMTP). Falls back to logging the
// message instead of sending when SMTP isn't configured, so local dev and
// a fresh checkout don't 500 on signup/forgot-password just because no mail
// provider has been wired up yet — callers never need to change either way.
const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implicit TLS; 587/25 use STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.warn(
    "[mailer] SMTP_HOST/SMTP_USER/SMTP_PASS not set — emails will be logged to the console instead of sent. " +
    "Set them in .env to enable real delivery."
  );
}

async function sendMail({ to, subject, text }) {
  if (!transporter) {
    console.log(`[mailer] (not configured — logging only) Would send email to ${to}: ${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({ from: MAIL_FROM, to, subject, text });
}

module.exports = { sendMail };
