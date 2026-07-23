/** Repoint the app's brand tokens to a chosen accent scale (buttons, focus,
 *  brand fills). Set inline on <html> so it wins over theme.css/globals and
 *  resolves per light/dark (e.g. var(--violet-a9) flips in dark mode). */

// brand token → Radix accent step
const BRAND_TOKENS: Record<string, string> = {
  "--color-brand-solid": "a9",
  "--color-brand-solid-hover": "a10",
  "--color-brand-solid-active": "a11",
  "--color-brand-foreground": "a10",
  "--color-brand-subtle": "a3",
  "--color-brand-subtle-hover": "a4",
  "--color-brand-border-default": "a6",
  "--color-brand-border-focus": "a8",
  "--color-brand-border-subtle": "a5",
  "--color-on-brand-subtle-foreground": "a9",
};

export function applyBrand(accent: string): void {
  const el = document.documentElement;
  for (const [token, step] of Object.entries(BRAND_TOKENS)) {
    el.style.setProperty(token, `var(--${accent}-${step})`);
  }
}
