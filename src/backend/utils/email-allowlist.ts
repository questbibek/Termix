/**
 * Email-domain allowlist for local registration — FORK ADDITION (not upstream).
 *
 * Restricts who can self-register by email domain. Configured via the
 * ALLOWED_EMAIL_DOMAINS env var (comma/space separated), e.g.
 *   ALLOWED_EMAIL_DOMAINS=vrittechnologies.com,encryptsec.com
 *
 * Empty/unset => feature OFF (upstream behaviour: email optional, any allowed).
 * Self-contained so it survives upstream syncs; callers touch it with one line.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getAllowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isEmailAllowlistEnabled(): boolean {
  return getAllowedEmailDomains().length > 0;
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

/** True if allowlist is off, or the email's domain matches an allowed domain (incl. subdomains). */
export function isEmailDomainAllowed(email: unknown): boolean {
  const domains = getAllowedEmailDomains();
  if (domains.length === 0) return true; // feature off
  if (!isValidEmail(email)) return false;
  const domain = email.trim().toLowerCase().split("@")[1];
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}
