# Fork & Rebrand Playbook (Termix)

**The repeatable recipe behind this fork.** This documents how we maintain
Termix as a Vrit Tech fork — tracking upstream (`Termix-SSH/Termix`) for features
and security patches while keeping a small, durable set of Vrit branding + custom
features on top — and how to **replicate the whole setup on a new project**.

> **Why a playbook and not just "edit some files"?** A naïve fork drifts: you
> hand-edit branded files, upstream changes them, every sync becomes a merge
> battle, and eventually you stop pulling security patches. This playbook keeps
> the merge surface *tiny and deterministic* so we can pull upstream forever.

The companion docs are the "how" you execute against; this file is the "why" and
the portable recipe:
- [BRANDING.md](BRANDING.md) — exact branding touch points + how to re-apply them.
- [MERGE_CHECKLIST.md](MERGE_CHECKLIST.md) — the gates every merge must pass.
- [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md) — branch model + what to take vs. keep.

---

## Part 1 — The philosophy (project-agnostic)

Four rules. Everything else follows from them.

### Rule 1 — Two branches: a pristine mirror + a deploy branch

| Branch | Role |
|--------|------|
| **`main`** | **Exact mirror of upstream.** No Vrit changes ever land here. Stays fast-forwardable forever. |
| **`vrit`** | **Our customizations.** This is what builds & deploys (pushing it triggers `build-deploy.yml` → VPS). |

Flow: `upstream → main (fast-forward) → merge main into vrit (resolve our fenced
conflicts) → push vrit → CI builds & deploys`.

> The mirror branch is a tripwire. If `git merge --ff-only upstream/main` ever
> *fails*, a Vrit commit leaked onto `main` — fix that, don't force it.

### Rule 2 — Isolate branding into new files upstream doesn't have

All branding *logic* lives in **new files** — a `<VritBrand>` component + logo
assets. New files can never conflict on a merge because upstream lacks them. This
is the single most important trick.

### Rule 3 — In shared files, touch one fenced line, marked for grep

When you *must* edit an upstream-owned file (favicon link, a logo slot), add the
smallest possible change wrapped in a **fenced, greppable marker**:

```
/* >>> VRIT BRANDING (see BRANDING.md) */
...one or two lines...
/* <<< VRIT BRANDING */
```

so (a) a merge conflict on that line is instantly recognizable, and (b) a script
can verify the hook still exists after every sync.

### Rule 4 — A verifier script + a checklist gate every merge

A merge is not "done" when it compiles. It is done when `scripts/check-branding.sh`
confirms every asset + hook survived, the project type-checks/builds, and a smoke
test of the built image passes. Pushing `vrit` ships to production, so the
[MERGE_CHECKLIST.md](MERGE_CHECKLIST.md) gates must ALL be green first.

---

## Part 2 — How this is implemented in Termix

Termix is a single-package SSH web client (Vite UI + Node/TS backend, SQLite, one
Docker image). The Vrit additions:

- **Branch model:** `main` = pristine mirror of `Termix-SSH/Termix`; `vrit` =
  deploy branch. See [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md).
- **Branding (isolated):**
  - New files: `public/vrit-{white,blue,fav}.png` +
    `src/ui/components/branding/VritBrand.tsx` (`<VritLogo>` + `<VritPoweredBy>`,
    theme-aware — blue on light, white on dark).
  - Fenced one-line hooks in 4 upstream files: `Auth.tsx`, `LoginPage.tsx`,
    `AppShell.tsx` (sidebar logo), `index.html` (favicon). Full snippets in
    [BRANDING.md](BRANDING.md).
  - Product name stays "Termix" — we only *add* a logo + "Powered by" line, so
    the merge surface is a handful of lines.
- **Custom features (also isolated):** R2 off-site backup, email-domain
  allowlist, signup-OTP/SMTP mailer — each in its own backend module, with fenced
  hooks where they wire into shared routes/schema.
- **Verifier:** `scripts/check-branding.sh` checks every asset + hook and exits
  non-zero with the exact thing to re-apply.
- **Merge gates:** no conflict markers → branding intact → backend `tsc` clean →
  UI `tsc` adds zero new errors vs pristine upstream → real Docker build → smoke
  test (migrations, auth, branding renders) → only then commit & push.

---

## Part 3 — Replicating this on a new fork

Apply the four rules to any upstream project. The rules don't change; only *where*
things go does. Steps:

1. **Pick the two branches.** Identify upstream's integration branch and make your
   local mirror track it; create a deploy branch off it. (e.g. Termix uses
   `main`/`vrit`; a project whose dev branch is `preview` would mirror `preview`.)
2. **Wire the `upstream` remote** and confirm the mirror fast-forwards:
   `git remote add upstream <url> && git fetch upstream && git merge --ff-only upstream/<branch>`.
3. **Create the brand component** (theme-aware logo + "Powered by") as a *new*
   file, and drop the logo PNGs into the app's `public/`. Copy
   `src/ui/components/branding/VritBrand.tsx` from this repo as the starting point
   and adapt its theme hook to the target's theme system.
4. **Add fenced `VRIT BRANDING` hooks** at the target's equivalents of Termix's
   touch points: the login/auth logo slot, the favicon `<link>`, and any
   app-shell/sidebar logo. Keep each change to one or two marked lines.
5. **Port the verifier** (`scripts/check-branding.sh`) to check the target's asset
   paths + hooks. In a monorepo with multiple frontends, loop over each app's
   `public/` and `root.tsx`.
6. **Adapt the two execution docs** — copy `BRANDING.md` and `MERGE_CHECKLIST.md`
   to the new repo and replace the touch points + build/test commands with the
   target's (its build tool, its backend migrations, its Docker setup).
7. **Gate the first merge** through the full checklist before wiring deploy.

> Keep the product name as-is — *add* logo + "Powered by", don't mass-rename. The
> tiny merge surface is the entire point.

A worked adaptation of this playbook for the **Plane** project (a Turbo monorepo
with a Django backend and three frontends) lives in that repo at
`D:\Code\plane\REBRAND_PLAYBOOK.md`, with its own `BRANDING.md` and
`MERGE_CHECKLIST.md` derived from the ones here.
