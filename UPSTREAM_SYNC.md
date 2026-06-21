# Syncing from Upstream (Termix-SSH/Termix)

This is a **fork** of [Termix-SSH/Termix](https://github.com/Termix-SSH/Termix)
maintained by Vrit Tech. We track upstream for features, bug fixes, and security
patches, while keeping a small set of our own additions on top.

## Branch model (two-branch / clean mirror)

| Branch | Role |
|--------|------|
| **`main`** | **Pristine mirror of upstream.** No Vrit changes ever land here. Stays fast-forwardable forever. |
| **`vrit`** | **Our customizations** (branding, R2 backup, email allowlist/OTP, CI). **This is what deploys** — pushing `vrit` triggers `build-deploy.yml`. |

So: upstream → `main` (fast-forward) → merge `main` into `vrit` (resolve our
fenced conflicts) → push `vrit` → CI builds & deploys.

---

## TL;DR — the sync flow

```bash
# 1. Update main to be an exact mirror of upstream
git fetch upstream
git checkout main
git merge --ff-only upstream/main      # always fast-forwards (main has no Vrit commits)
git push origin main

# 2. Bring upstream's changes into our deploy branch
git checkout vrit
git merge main                         # resolve any VRIT-fenced conflicts (see tables below)

# 3. Verify our additions survived
./scripts/check-branding.sh            # branding intact?
npx tsc -p tsconfig.node.json --noEmit # backend still compiles (backup + email modules)?

# 4. Ship it
git push origin vrit                   # push -> build-deploy.yml builds + deploys vrit
```

> Keep `main` clean: never commit Vrit changes to `main`. If you accidentally do,
> the `--ff-only` in step 1 will start failing — that's your signal.

---

## ✅ What we WANT from upstream (take theirs)

Everything that is the actual product — pull it all:

- App features & UI (terminal, SSH, file manager, dashboard, docker, etc.)
- Bug fixes and **security patches** (highest priority reason we track upstream)
- Database schema/migrations
- Dependency bumps for upstream's own packages
- Translations, docs, Dockerfile/runtime improvements

Default stance: **accept upstream's version** of any file we have NOT
intentionally modified.

---

## 🔒 What we must KEEP as ours (preserve on conflict)

These are Vrit Tech additions. Upstream doesn't have them, so most will **never
conflict**. The few that touch shared files are marked and easy to re-apply.

### Files that are 100% ours (no conflict possible — upstream lacks them)

| Path | What it is |
|------|-----------|
| `BRANDING.md`, `UPSTREAM_SYNC.md`, `EMAIL_ALLOWLIST.md`, `EMAIL_SETUP.md`, `DEPLOY.md` | These docs |
| `src/backend/utils/email-allowlist.ts` | Email-domain allowlist logic |
| `src/backend/utils/mailer.ts` | SMTP + signup-OTP / reset email helpers |
| `src/ui/components/branding/VritBrand.tsx` | Logo + "Powered by" component |
| `public/vrit-white.png`, `public/vrit-blue.png`, `public/vrit-fav.png` | Brand assets |
| `src/backend/utils/r2-backup.ts` | R2 off-site backup module |
| `.github/workflows/build-deploy.yml` | Our CI: build our image + deploy to VPS |
| `.github/workflows/sync-upstream.yml` | Manual "sync upstream" button |
| `docker/compose.prod.yml` | Prod compose pointing at our image |
| `docker/backup.env.example` | Backup config template |
| `scripts/check-branding.sh` | Post-sync branding verifier |

If a merge ever **deletes** one of these (it shouldn't), restore it from our
history: `git checkout HEAD -- <path>`.

### Shared upstream files we modified (CAN conflict — keep BOTH sides)

| File | Our change | Marker to look for |
|------|-----------|--------------------|
| `src/ui/auth/LoginPage.tsx` | Login logo + powered-by | `VRIT BRANDING` |
| `src/ui/AppShell.tsx` | Sidebar logo | `VRIT BRANDING` |
| `index.html` | Favicon → `vrit-fav.png` | `VRIT BRANDING` |
| `src/backend/database/db/index.ts` | Backup scheduler import + `users.email` column/migration | `Fork addition` / `VRIT` |
| `src/backend/database/db/schema.ts` | `email` + `email_verified` columns | `VRIT` |
| `src/backend/database/routes/users.ts` | Allowlist + signup OTP + login gate | `VRIT` |
| `src/backend/database/routes/user-password-reset-routes.ts` | Email the reset code | `VRIT` |
| `src/backend/database/routes/user-admin-routes.ts` | `email` in `/users/list` | `VRIT` |
| `src/ui/auth/Auth.tsx` | Branding + signup email field | `VRIT` |
| `src/ui/main-axios.ts` | `registerUser` email arg + `UserInfo.email` | `VRIT` |
| `src/ui/sidebar/AdminManagementSections.tsx` | Email in admin user row | `VRIT` |
| `src/ui/sidebar/AdminSettingsPanel.tsx` | Email in AdminUser mapping | `VRIT` |
| `docker/compose.prod.yml` | (ours; not upstream's `docker-compose.yml`) | n/a |
| `package.json` | Added deps: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `tar` | the 3 dep lines |

**Conflict rule for these:** take upstream's changes **and** re-add our marked
block / dep lines. Full snippets for the branding hooks live in `BRANDING.md`.
For `package.json`, just make sure our 3 dependencies are still present after
the merge.

---

## ❌ What we DON'T rely on from upstream

Upstream's publishing workflows target **their** registries/secrets and will not
run on our fork:

- `.github/workflows/docker.yml` — pushes to `ghcr.io/lukegus` + their Docker Hub, uses Blacksmith runners
- `.github/workflows/release.yml`, `electron.yml` — their release/signing pipeline

We keep these files (so merges stay clean) but **ignore them** — our pipeline is
`build-deploy.yml`. Don't add our VPS/registry secrets to their workflows.

---

## Post-sync checklist

1. `./scripts/check-branding.sh` → "Branding intact."
2. `npx tsc -p tsconfig.node.json --noEmit` → no backend errors (confirms the
   backup module + its hook still compile).
3. Confirm `package.json` still lists `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `tar`.
4. Push to `main` → CI builds and deploys.
5. Smoke-test the deployed site (login page shows Vrit logo).
