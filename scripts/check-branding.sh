#!/usr/bin/env bash
#
# Verifies Vrit Tech branding is still intact. Run after every upstream sync —
# if a merge silently dropped a branding edit, this fails loudly so you can
# re-apply it (see BRANDING.md). Exit 0 = all present, 1 = something missing.
#
#   ./scripts/check-branding.sh

set -u
cd "$(dirname "$0")/.." || exit 1

fail=0
need_file() {
  if [ ! -f "$1" ]; then echo "MISSING FILE:   $1"; fail=1; else echo "ok  file        $1"; fi
}
need_match() {
  # need_match <file> <grep-string> <label>
  if grep -qF -- "$2" "$1" 2>/dev/null; then
    echo "ok  hook        $3"
  else
    echo "MISSING HOOK:   $3  (expected \"$2\" in $1)"; fail=1
  fi
}

# Assets (new files — never conflict with upstream)
need_file public/vrit-white.png
need_file public/vrit-blue.png
need_file public/vrit-fav.png
need_file src/ui/components/branding/VritBrand.tsx

# One-line hooks inside upstream-owned files (these CAN be dropped by a merge)
# Auth.tsx is the PRIMARY login (rendered by main.tsx). LoginPage.tsx is the
# secondary login shown only inside full-screen docker/file-manager popups.
need_match src/ui/auth/Auth.tsx      "VritLogo"        "Auth (main login) logo"
need_match src/ui/auth/Auth.tsx      "VritPoweredBy"   "Auth (main login) powered-by"
need_match src/ui/auth/LoginPage.tsx "VritLogo"        "LoginPage (popup login) logo"
need_match src/ui/AppShell.tsx       "VritLogo"        "AppShell sidebar logo"
need_match index.html                "vrit-fav.png"    "favicon"

echo
if [ "$fail" -eq 0 ]; then
  echo "Branding intact."
else
  echo "Branding INCOMPLETE — re-apply the missing hooks per BRANDING.md."
fi
exit "$fail"
