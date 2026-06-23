# Upstream Merge Validation Checklist

**Every `main → vrit` merge MUST pass every gate below before you commit/push.**
Pushing `vrit` auto-deploys to production (`wsl.vrittechnologies.com`), so a merge
is not "done" until all checks are green. This is the process that was validated
for the 2.4.0 → 2.4.1 merge. See also [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md) (branch
model) and [BRANDING.md](BRANDING.md) (branding touch points).

---

## 0. Pre-flight
- [ ] A recent DB backup exists (R2 `wsl-backup/data-backups/` or a manual SQLite copy).
- [ ] `git status` is clean on `vrit`.

## 1. Sync `main` (pristine mirror — never deploys)
```bash
git fetch upstream && git checkout main && git merge --ff-only upstream/main && git push origin main
git fetch origin && git checkout vrit
```

## 2. Start the merge
```bash
git merge main            # do NOT commit yet
git diff --name-only --diff-filter=U   # list conflicts
```

## 3. Resolve conflicts with intent
For each conflict decide **drop** vs **keep** using this rule:

| If the conflict is… | Action |
|---|---|
| A patch upstream now implements officially (admin-create, pw-login fix, SSO URL fix, storage default, folder picker, etc.) | **Take upstream** (`>>>>>>> main` side); delete our now-redundant code, including any orphaned state/props/imports it leaves behind. |
| One of our **unique** features (branding, R2 backup, email-domain allowlist, signup-OTP/SMTP, terminal padding, host/credential duplicate, credential picker, snippet folder picker, CI) | **Keep ours**, merged *with* upstream's surrounding changes (don't clobber new upstream code). Look for `VRIT:` markers / the grep tokens in UPSTREAM_SYNC.md. |
| A `.github/workflows/*` file with `runs-on: blacksmith-*` or `useblacksmith/*` | **Keep ours** — swap to GitHub-hosted (`ubuntu/windows/macos-latest`, `docker/*` actions). Blacksmith jobs queue forever on our fork. See UPSTREAM_SYNC.md. |
| `package.json` | Keep our deps (`@aws-sdk/*`, `tar`, `nodemailer`) **and** take upstream's version bumps. |
| `package-lock.json` | Don't hand-merge: `git checkout --theirs -- package-lock.json && npm install --package-lock-only`. |

> After dropping a redundant patch, grep for leftovers it referenced
> (e.g. `requesterIsAdmin`, `FORCE_PASSWORD_LOGIN`, `newEmail`) and remove them
> from **all** files + any env in `docker/compose.prod.yml`.

## 4. Validation gates — ALL must pass before committing

```bash
# (a) no conflict markers anywhere
git grep -n "^<<<<<<<\|^>>>>>>>" | grep -v "\.md:" ; echo "↑ must be empty"

# (b) branding + unique features intact
./scripts/check-branding.sh                      # → "Branding intact."
for f in src/backend/utils/r2-backup.ts src/backend/utils/mailer.ts \
         src/backend/utils/email-allowlist.ts src/ui/components/branding/VritBrand.tsx; do
  [ -f "$f" ] && echo "ok $f" || echo "MISSING $f"; done
grep -q "startR2BackupScheduler" src/backend/database/db/index.ts && echo "ok R2 hook"
grep -q "verify-signup" src/backend/database/routes/users.ts && echo "ok signup-otp"
grep -q "isEmailAllowlistEnabled" src/backend/database/routes/users.ts && echo "ok allowlist"
grep -q "email_verified" src/backend/database/db/schema.ts && echo "ok email_verified col"

# (b2) fork UX features survived + no Blacksmith runner crept back in
git grep -n "blacksmith" -- .github/workflows/ ; echo "↑ must be empty (we run GitHub-hosted)"
grep -q "duplicateSSHHost" src/ui/api/ssh-host-management-api.ts && echo "ok host duplicate"
grep -q "duplicateCredential" src/ui/api/credentials-api.ts && echo "ok credential duplicate"
grep -q "CredentialPicker" src/ui/sidebar/HostEditor.tsx && echo "ok credential picker"
grep -q "SnippetFolderPicker" src/ui/sidebar/SnippetsPanel.tsx && echo "ok snippet folder picker"

# (c) backend typecheck — MUST be clean
npx tsc -p tsconfig.node.json --noEmit && echo "BACKEND PASS"

# (d) UI typecheck — our merge must add ZERO errors vs pristine upstream.
#     (UI isn't tsc-gated; upstream ships with its own tsc noise. Compare counts.)
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"   # = MERGED count
git stash; git checkout main
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"   # = UPSTREAM count
git checkout vrit; git stash pop 2>/dev/null
#  → MERGED count MUST equal UPSTREAM count. If higher, we introduced errors — fix them.

# (e) real build (Vite + backend) — the gate tsc-noise can't catch
docker build -f docker/Dockerfile -t termix:merge-test .   # MUST exit 0
```

## 5. Smoke test the built image
```bash
docker rm -f termix-smoke 2>/dev/null; docker volume rm termix_smoke 2>/dev/null
docker run -d --name termix-smoke -p 8099:8080 \
  -e ALLOWED_EMAIL_DOMAINS=vrittechnologies.com -v termix_smoke:/app/data termix:merge-test
sleep 8
docker logs termix-smoke 2>&1 | grep -iE "migrat|started|error|fatal"   # migrations ok, no fatal
B=http://localhost:8099
curl -s -w " [%{http_code}]\n" -X POST $B/users/create -d '{"username":"a","password":"vrit12345"}' -H "Content-Type: application/json"   # first user 200
curl -s -w " [%{http_code}]\n" -X POST $B/users/create -d '{"username":"b","password":"vrit12345","email":"x@gmail.com"}' -H "Content-Type: application/json"  # 403 allowlist
curl -s -w " [%{http_code}]\n" -X POST $B/users/login  -d '{"username":"a","password":"vrit12345"}' -H "Content-Type: application/json"   # login 200
# Optional: load http://localhost:8099 in a browser — confirm Vrit logo + "Powered by" render.
docker rm -f termix-smoke; docker volume rm termix_smoke
```
- [ ] Migrations completed, no `fatal`/crash on startup
- [ ] First user 200, gmail signup **403**, login 200
- [ ] Branding renders on the login page

## 6. Only now: commit & deploy
```bash
git commit --no-edit          # commit the merge
git push origin vrit          # → CI builds + deploys to wsl.vrittechnologies.com
```
- [ ] Actions run: **build ✅ + deploy ✅**
- [ ] On the VPS: `docker logs --since 3m termix | grep -iE "migrat|error"` clean; site loads.

## Rollback (if a deploy goes bad)
Data is on the persistent volume (untouched by image swaps), and you have the
SQLite/R2 backup. To revert the app: `git revert -m 1 <merge-commit>` on `vrit`
and push (redeploys the previous version); restore the DB from backup only if a
migration corrupted data (additive migrations shouldn't).
