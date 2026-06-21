# Email-Domain Allowlist for Registration (fork feature)

A Vrit Tech addition (not in upstream Termix). It restricts **who can
self-register** by email domain, so a public instance can't be abused by random
signups — without you having to monitor it.

## How it works

- Signup now collects an **email** (stored on the user, visible to admins).
- Set **`ALLOWED_EMAIL_DOMAINS`** (comma/space separated). Only emails on those
  domains (or their subdomains) can register.
- **Empty/unset = feature off** → upstream behaviour (email optional, anyone can
  register if registration is enabled).
- The **first user** (initial admin) is always allowed, so you can bootstrap
  before the list is set.
- Enforced server-side in the `/users/create` endpoint — the email field in the
  UI is just convenience; the backend is the gate.

```
ALLOWED_EMAIL_DOMAINS=vrittechnologies.com,encryptsec.com

jane@vrittechnologies.com   -> allowed
bob@dev.vrittechnologies.com-> allowed (subdomain)
random@gmail.com            -> 403 rejected
```

## Configure

On the server, set it in `/opt/termix/.env` (compose auto-loads it):

```
ALLOWED_EMAIL_DOMAINS=vrittechnologies.com
```

Then `docker compose -f docker/compose.prod.yml up -d`. No rebuild needed — it's
runtime config.

## Admin visibility

Admins see each user's registered email in **Admin → User Management** (and via
`GET /users/list`). Note: this is the registration email only; it does **not**
let admins read other users' SSH vaults — those stay encrypted per-user by
design.

## Defense-in-depth

The allowlist gates *who* can register, but email here is **self-asserted and
unverified** (no confirmation link). For a hard guarantee, combine with one of:
- **Disable open registration** entirely (`allow_registration=false` in admin
  settings) and create accounts yourself; or
- **Google/OIDC SSO** with the OIDC `allowed_users` domain allowlist, which is
  verified by the identity provider.

The email allowlist is the lightweight self-service option; SSO is the verified
one.

## Touch points (for upstream merges — see UPSTREAM_SYNC.md)

New file (no conflict): `src/backend/utils/email-allowlist.ts`.

Fenced `VRIT` edits in upstream files:
- `src/backend/database/db/schema.ts` — `email` column on `users`
- `src/backend/database/db/index.ts` — `email` in CREATE TABLE + ALTER migration
- `src/backend/database/routes/users.ts` — import, validation, INSERT email
- `src/backend/database/routes/user-admin-routes.ts` — email in `/users/list`
- `src/ui/auth/Auth.tsx` — email state + signup field + passed to API
- `src/ui/main-axios.ts` — `registerUser` email arg + `UserInfo.email`
- `src/ui/sidebar/AdminManagementSections.tsx` — email in admin row + type
- `src/ui/sidebar/AdminSettingsPanel.tsx` — email in the AdminUser mapping
- `docker/compose.prod.yml` — `ALLOWED_EMAIL_DOMAINS` env
