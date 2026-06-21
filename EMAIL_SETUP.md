# Email: SMTP, Password Reset & Signup OTP (fork feature)

Vrit Tech addition (not in upstream Termix). Adds generic SMTP so Termix can
**email password-reset codes** and **verify emails at signup with a 6-digit OTP**.

Upstream has no email at all — reset codes are written to the docker logs and
there is no signup verification. This feature layers on top and is **fully
optional**: with no SMTP configured, behaviour is exactly upstream.

## Configure SMTP

Set these in `/opt/termix/.env` (compose auto-loads it). Works with any SMTP —
Gmail/Google Workspace, Zoho, Fastmail, SES, or your own server:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=no-reply@vrittechnologies.com
SMTP_PASS=your_app_password          # Gmail/Workspace: use an App Password
SMTP_FROM=Termix <no-reply@vrittechnologies.com>
SMTP_SECURE=                         # blank = auto (true on 465, STARTTLS otherwise)
SIGNUP_OTP_ENABLED=true              # require signup email verification (default true)
```

Then `docker compose -f docker/compose.prod.yml up -d`. No rebuild — runtime config.

## What each feature does

### Password reset
`Forgot password` generates a 6-digit code. **If SMTP is configured and the user
has an email on file, the code is emailed.** Otherwise it falls back to the
docker logs (upstream behaviour). The reset flow itself is unchanged.

### Signup OTP verification
When SMTP is configured (and `SIGNUP_OTP_ENABLED` isn't `false`):
1. A new user signs up (username, email, password).
2. The account is created but **`email_verified = 0`** and a code is emailed.
3. The signup screen shows a **"Verify your email"** step.
4. They enter the code → `email_verified = 1` → they're logged in.
5. **Login is blocked** until verified (`403`, routes back to the code step).

This makes the registration email **verified** — closing the "self-asserted
email" gap in the domain allowlist ([EMAIL_ALLOWLIST.md](EMAIL_ALLOWLIST.md)).
Combine the two: allowlist limits *which* domain, OTP proves the address is real.

### Why "verify before login" and not "no account until verified"
Termix derives each user's **data-encryption key from their password** at account
creation. A true "pending registration" would require storing the **plaintext
password** until verification — which we refuse to do. So the account is created
normally (password handled securely) but is **unusable until the email is
verified**. Same security outcome, no plaintext secrets stored.

The first user (initial admin) is always created verified, so you can bootstrap.

## Notes
- Codes expire in 15 minutes; `Resend code` issues a new one.
- If SMTP send fails, the code is logged as a fallback so you're never locked out.
- TOTP (authenticator-app 2FA at login) is a separate, pre-existing Termix
  feature — unrelated to this email OTP.

## Touch points (for upstream merges — see UPSTREAM_SYNC.md)

New file (no conflict): `src/backend/utils/mailer.ts`.

Fenced `VRIT` edits:
- `src/backend/database/db/schema.ts` + `index.ts` — `email_verified` column + migration
- `src/backend/database/routes/users.ts` — OTP on create, `/verify-signup`, `/resend-signup-otp`, login gate
- `src/backend/database/routes/user-password-reset-routes.ts` — email the reset code
- `src/ui/auth/Auth.tsx` — signup OTP view + handlers
- `src/ui/main-axios.ts` — `verifySignupOtp` / `resendSignupOtp`
- `docker/compose.prod.yml` — SMTP env
