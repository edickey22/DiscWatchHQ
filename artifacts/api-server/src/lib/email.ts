/**
 * email.ts — transactional email module.
 *
 * ── Current state ──────────────────────────────────────────────────────────
 * The SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) are
 * already provisioned as Replit secrets.  This module reads them and sends
 * via nodemailer over SMTP.
 *
 * ── Switching to Resend (or another provider) ──────────────────────────────
 * When Erik is ready to move to Resend:
 *   1. Install:  pnpm --filter @workspace/api-server add resend
 *   2. Add secret: RESEND_API_KEY
 *   3. Replace the sendViaSmtp() implementation below with:
 *        import { Resend } from 'resend';
 *        const resend = new Resend(process.env.RESEND_API_KEY);
 *        await resend.emails.send({ from, to, subject, html });
 *   4. Remove nodemailer dependency.
 *
 * Until then the SMTP path is active.  If SMTP_HOST is not set (e.g. in a
 * local dev environment without secrets), the function logs the email content
 * to the console rather than throwing, so the rest of auth still works.
 */

import nodemailer from "nodemailer";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
}

// ── SMTP transport (lazy singleton) ───────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // ── STUB MODE ──────────────────────────────────────────────────────────
    // Credentials not configured.  Log instead of sending.
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

// ── Internal send ─────────────────────────────────────────────────────────────

async function sendEmail(payload: EmailPayload): Promise<void> {
  const from = process.env.SMTP_USER ?? "noreply@discwatchhq.com";
  const transporter = getTransporter();

  if (!transporter) {
    // Stub mode — log the would-be email so auth still works in dev.
    logger.info(
      { to: payload.to, subject: payload.subject },
      "[email STUB] SMTP not configured — logging email instead of sending",
    );
    logger.info({ body: payload.text }, "[email STUB] body");
    return;
  }

  const info = await transporter.sendMail({
    from: `DiscWatchHQ <${from}>`,
    to:   payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  logger.info(
    {
      to:        payload.to,
      subject:   payload.subject,
      messageId: info.messageId,
      response:  info.response,
      accepted:  info.accepted,
      rejected:  info.rejected,
    },
    "Email sent",
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a magic-link login email.
 * @param email  Recipient email address.
 * @param link   The full verify URL including the raw token as a query param.
 */
export async function sendMagicLinkEmail(email: string, link: string): Promise<void> {
  await sendEmail({
    to:      email,
    subject: "Your DiscWatchHQ login link",
    text:    `Click this link to log in to DiscWatchHQ (expires in 15 minutes):\n\n${link}\n\nIf you didn't request this, you can safely ignore it.`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0a0c0a;color:#f0f0f0;padding:40px 20px;max-width:480px;margin:0 auto">
  <div style="margin-bottom:24px">
    <span style="font-size:20px;font-weight:bold;color:#ffffff">Disc</span><span style="font-size:20px;font-weight:bold;color:#21b557">Watch</span>
    <span style="font-size:11px;font-weight:bold;color:#21b557;border:1px solid #21b557;border-radius:4px;padding:2px 6px;margin-left:6px">HQ</span>
  </div>
  <h2 style="color:#ffffff;margin:0 0 16px">Your login link</h2>
  <p style="color:#a0a0a0;margin:0 0 28px">Click the button below to sign in. This link expires in <strong style="color:#f0f0f0">15 minutes</strong> and can only be used once.</p>
  <a href="${link}" style="display:inline-block;background:#21b557;color:#000000;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none">Sign in to DiscWatchHQ</a>
  <p style="color:#666;font-size:12px;margin-top:32px">If you didn't request this email, you can safely ignore it. No account changes will be made.</p>
</body>
</html>`,
  });
}

/**
 * Send an alert notification email.
 *
 * ── INTEGRATION POINT ─────────────────────────────────────────────────────────
 * This is called by src/lib/alertChecker.ts when a tracked item's status or
 * price crosses the user's alert threshold.  Wire in Resend or another
 * provider here (see top of file) before enabling real alert delivery.
 */
export async function sendAlertEmail(opts: {
  to:         string;
  itemTitle:  string;
  alertType:  "restock" | "price_drop" | "status_change";
  detail:     string;
  itemUrl:    string;
  /** Absolute URL to the item's cover art / product photo. Optional — omit the image block if absent. */
  imageUrl?:  string | null;
}): Promise<void> {
  const typeLabel: Record<string, string> = {
    restock:       "Back in stock",
    price_drop:    "Price drop",
    status_change: "Status update",
  };

  const label = typeLabel[opts.alertType] ?? "Update";

  // Image block — uses a plain <img> so it works across Gmail, Outlook, Apple Mail.
  // CSS background-image is stripped by most email clients, so we never use it here.
  // width=480 + height=auto keeps the layout stable even when images are blocked.
  const imageBlock = opts.imageUrl
    ? `
  <div style="margin-bottom:24px;text-align:center">
    <img
      src="${opts.imageUrl}"
      alt="${opts.itemTitle}"
      width="480"
      height="270"
      style="display:block;width:100%;max-width:480px;height:auto;max-height:270px;object-fit:cover;border-radius:8px;border:1px solid #1e2d1e"
    />
  </div>`
    : "";

  await sendEmail({
    to:      opts.to,
    subject: `[DiscWatchHQ] ${label}: ${opts.itemTitle}`,
    text:    `${label} for "${opts.itemTitle}"\n\n${opts.detail}\n\nView it here: ${opts.itemUrl}\n\nTo manage your alerts, visit ${process.env.APP_URL ?? "https://discwatchhq.com"}/profile`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0a0c0a;color:#f0f0f0;padding:40px 20px;max-width:480px;margin:0 auto">
  <div style="margin-bottom:24px">
    <span style="font-size:20px;font-weight:bold;color:#ffffff">Disc</span><span style="font-size:20px;font-weight:bold;color:#21b557">Watch</span>
    <span style="font-size:11px;font-weight:bold;color:#21b557;border:1px solid #21b557;border-radius:4px;padding:2px 6px;margin-left:6px">HQ</span>
  </div>${imageBlock}
  <h2 style="color:#21b557;margin:0 0 8px">${label}</h2>
  <h3 style="color:#ffffff;margin:0 0 16px">${opts.itemTitle}</h3>
  <p style="color:#a0a0a0;margin:0 0 28px">${opts.detail}</p>
  <a href="${opts.itemUrl}" style="display:inline-block;background:#21b557;color:#000000;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none">View item</a>
  <p style="color:#666;font-size:12px;margin-top:32px">Manage your alerts at <a href="${process.env.APP_URL ?? "https://discwatchhq.com"}/profile" style="color:#21b557">DiscWatchHQ Profile</a></p>
</body>
</html>`,
  });
}
