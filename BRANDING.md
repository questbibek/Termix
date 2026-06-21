# Vrit Tech Branding (fork customization)

This fork adds Vrit Tech branding on top of upstream Termix. It is designed so
that **pulling upstream updates does not clobber the branding**, and so that if
a merge ever does touch a branded line, you can re-apply it in seconds.

> Product name stays **"Termix"** — we only add the Vrit Tech logo + a
> "Powered by" line. No mass rename, so the merge surface is tiny.

## Design: isolate, don't scatter

All branding *logic* lives in **new files that upstream doesn't have**, so they
can never conflict on a merge:

| New file | Purpose |
|----------|---------|
| `public/vrit-white.png` | Wordmark for dark themes |
| `public/vrit-blue.png`  | Wordmark for the light theme |
| `public/vrit-fav.png`   | Favicon |
| `src/ui/components/branding/VritBrand.tsx` | `<VritLogo>` + `<VritPoweredBy>` (theme-aware) |

Upstream-owned files only get a **single fenced import + tag**, marked so they
are trivial to spot and restore:

```
/* >>> VRIT BRANDING (see BRANDING.md) */
...one or two lines...
/* <<< VRIT BRANDING */
```

## The exact touch points

These are the only edits inside upstream files. If a merge conflict ever
involves one of them, re-apply exactly this:

### 1. `src/ui/auth/Auth.tsx` — the PRIMARY login (rendered by `main.tsx`)
> Note: there are two login components. `Auth.tsx` is the real one users see.
> `LoginPage.tsx` (below) is a near-duplicate used only inside full-screen
> docker/file-manager popups. Brand both for consistency.
- Import near the other imports:
  ```tsx
  /* >>> VRIT BRANDING (see BRANDING.md) */
  import { VritLogo, VritPoweredBy } from "@/components/branding/VritBrand.tsx";
  /* <<< VRIT BRANDING */
  ```
- In the left decorative hero panel (the `flex flex-col items-center justify-center`
  block), logo **above** the hardcoded `TERMIX` wordmark, powered-by **below**
  the `{t("auth.tagline")}` line:
  ```tsx
  {/* >>> VRIT BRANDING (see BRANDING.md) */}
  <VritLogo className="h-10 w-auto mb-3" />
  {/* <<< VRIT BRANDING */}
  ...TERMIX wordmark + tagline...
  {/* >>> VRIT BRANDING (see BRANDING.md) */}
  <VritPoweredBy className="mt-6" />
  {/* <<< VRIT BRANDING */}
  ```

### 2. `src/ui/auth/LoginPage.tsx` — secondary (popup) login
Same import + `<VritLogo className="h-12 w-auto mx-auto mb-8" />` above the
`{t("common.appName").toUpperCase()}` wordmark and
`<VritPoweredBy className="mt-10" />` below the `{t("auth.tagline")}` block, all
inside the `<div className="relative text-center px-8">` hero.

### 3. `src/ui/AppShell.tsx`
- Import near the other imports:
  ```tsx
  /* >>> VRIT BRANDING (see BRANDING.md) */
  import { VritLogo } from "@/components/branding/VritBrand.tsx";
  /* <<< VRIT BRANDING */
  ```
- A logo header at the very top of `sidebarPanelContent` (first child of the
  outer `<div className="flex flex-col flex-1 min-h-0 overflow-hidden">`):
  ```tsx
  {/* >>> VRIT BRANDING (see BRANDING.md) */}
  <div className="flex items-center justify-center py-2.5 border-b border-edge shrink-0">
    <VritLogo className="h-5 w-auto opacity-90" />
  </div>
  {/* <<< VRIT BRANDING */}
  ```

### 4. `index.html`
- Favicon and apple-touch-icon point at `/vrit-fav.png`:
  ```html
  <!-- VRIT BRANDING (see BRANDING.md) -->
  <link rel="icon" type="image/png" href="/vrit-fav.png" />
  ...
  <!-- VRIT BRANDING (see BRANDING.md) -->
  <link rel="apple-touch-icon" href="/vrit-fav.png" />
  ```

## What happens on an upstream sync

```bash
git fetch upstream && git merge --ff-only upstream/main   # your usual flow
```

- **New files** (`VritBrand.tsx`, the PNGs): never conflict — upstream doesn't
  have them.
- **The 3 upstream files**: conflict *only* if upstream edits the exact same
  lines. If it does, git marks the conflict; keep both upstream's change and the
  fenced `VRIT BRANDING` block, then continue.

After **every** sync, verify nothing was dropped:

```bash
./scripts/check-branding.sh
```

It checks all assets + every hook above and exits non-zero if anything is
missing, telling you exactly what to re-apply.

## Notes / TODO

- **Company URL**: `VritBrand.tsx` links "Powered by" to
  `https://vrittechnologies.com` (`VRIT_URL` const). The visible short sign is
  "Vrit Tech".
- **Theme behavior**: the logo auto-swaps — blue on the `light` theme, white on
  all dark themes — via the `useTheme()` hook.
- **Favicon visibility**: `vrit-fav.png` is a white mark; it shows well on dark
  browser chrome but can be faint on light tabs. Swap in a higher-contrast
  icon if needed (same filename, no code change).
- **Login branding on mobile**: the login hero panel is `hidden md:flex`, so the
  login logo/powered-by show on tablet/desktop widths; the sidebar logo shows
  everywhere.
