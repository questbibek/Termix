/**
 * SMTP mailer + email-verification helpers — FORK ADDITION (not upstream).
 *
 * Generic SMTP via env (works with Gmail/Workspace, Zoho, Fastmail, self-hosted):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *
 * If SMTP is not configured, isMailerConfigured() is false and callers fall back
 * to logging codes to the container logs (upstream behaviour). Self-contained so
 * it survives upstream syncs. See EMAIL_SETUP.md.
 */
import crypto from "crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { authLogger } from "./logger.js";

let transporter: Transporter | null = null;

export function isMailerConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    (process.env.SMTP_FROM || process.env.SMTP_USER)
  );
}

function getTransporter(): Transporter | null {
  if (!isMailerConfigured()) return null;
  if (transporter) return transporter;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // implicit TLS on 465; STARTTLS otherwise. Override with SMTP_SECURE.
    secure:
      process.env.SMTP_SECURE != null
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

function fromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";
}

/** Returns true if the mail was sent. Never throws — logs and returns false on error. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return true;
  } catch (err) {
    authLogger.error("Failed to send email", err, { operation: "smtp_send" });
    return false;
  }
}

/** Signup email-OTP is active only when SMTP is configured (and not explicitly disabled). */
export function isSignupOtpEnabled(): boolean {
  return isMailerConfigured() && process.env.SIGNUP_OTP_ENABLED !== "false";
}

export function generateOtpCode(): string {
  // 6-digit, crypto.randomInt like the existing password-reset flow.
  return crypto.randomInt(100000, 1000000).toString();
}

const APP_NAME = "Termix";

export async function sendSignupOtpEmail(
  to: string,
  code: string,
): Promise<boolean> {
  return sendMail({
    to,
    subject: `${APP_NAME} — verify your email`,
    text: `Your ${APP_NAME} verification code is ${code}. It expires in 15 minutes.`,
    html: `<p>Your <b>${APP_NAME}</b> verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p><p>It expires in 15 minutes.</p>`,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  code: string,
): Promise<boolean> {
  return sendMail({
    to,
    subject: `${APP_NAME} — password reset code`,
    text: `Your ${APP_NAME} password reset code is ${code}. It expires shortly. If you didn't request this, ignore this email.`,
    html: `<p>Your <b>${APP_NAME}</b> password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p><p>If you didn't request this, ignore this email.</p>`,
  });
}
