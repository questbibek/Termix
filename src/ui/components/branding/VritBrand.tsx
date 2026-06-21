/**
 * Vrit Tech branding — FORK ADDITION (not in upstream Termix).
 *
 * All branding logic lives in this self-contained file plus the PNGs in
 * /public (vrit-white.png, vrit-blue.png, vrit-fav.png). Shared upstream files
 * only get a one-line import + tag, fenced with `VRIT BRANDING` comments.
 * See BRANDING.md for the full list of touch points and how to re-apply them
 * if an upstream merge ever conflicts.
 */
import { useTheme } from "@/components/theme-provider";

// White wordmark reads on dark surfaces; blue reads on the light theme.
function useVritLogoSrc(): string {
  const { theme } = useTheme();
  let isLight = theme === "light";
  if (theme === "system" && typeof window !== "undefined") {
    isLight = !window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return isLight ? "/vrit-blue.png" : "/vrit-white.png";
}

export function VritLogo({ className = "" }: { className?: string }) {
  const src = useVritLogoSrc();
  return (
    <img src={src} alt="Vrit Tech" className={className} draggable={false} />
  );
}

const VRIT_URL = "https://vrittechnologies.com";

export function VritPoweredBy({ className = "" }: { className?: string }) {
  const src = useVritLogoSrc();
  return (
    <a
      href={VRIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <span>Powered by</span>
      <img
        src={src}
        alt="Vrit Tech"
        className="h-3.5 w-auto"
        draggable={false}
      />
    </a>
  );
}
