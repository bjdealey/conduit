/* =============================================================================
   Keyboard shortcut labels
   -----------------------------------------------------------------------------
   A menu that binds a key should say which key, and say it in the words printed
   on the keyboard in front of you. A hint naming a key the machine doesn't have
   is worse than no hint: "Del" on a MacBook points at nothing, and the reader has
   to work out that it means the key labelled ⌫.

   Two labels come out of here, not one. `label` is the glyph the row draws;
   `keys` is the token `aria-keyshortcuts` takes, which is a fixed key name in
   every case — a screen reader announcing "⌫" would be reading a picture.
   ============================================================================= */

/** A shortcut hint: what to draw, and what to announce. */
export type Shortcut = {
  /** What the row shows — a keycap glyph where the platform uses one. */
  label: string;
  /** The `aria-keyshortcuts` token: a key name, never a glyph. */
  keys: string;
};

/** The shortcuts the library tree binds and its menus advertise. */
export type ShortcutName = "rename" | "delete" | "dismiss";

const SHORTCUTS: Record<ShortcutName, { keys: string; label: string; apple?: string }> = {
  rename: { keys: "F2", label: "F2" },
  // The tree's handler takes Delete *and* Backspace, so the hint is free to name
  // whichever of the two the keyboard actually has.
  delete: { keys: "Delete", label: "Del", apple: "⌫" },
  dismiss: { keys: "Escape", label: "Esc" },
};

/**
 * Whether this platform labels its keys the Apple way.
 *
 * `navigator.platform` is deprecated but still the only thing every browser
 * agrees on; `userAgentData.platform` is checked first where it exists. Takes
 * the navigator as an argument so the mapping is testable without one.
 */
export function isApplePlatform(nav: Navigator = typeof navigator === "undefined" ? ({} as Navigator) : navigator) {
  const data = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad|ipod/i.test(data?.platform || nav.platform || nav.userAgent || "");
}

/** The hint for a bound key, in this platform's words. */
export function shortcutFor(name: ShortcutName, apple = isApplePlatform()): Shortcut {
  const shortcut = SHORTCUTS[name];
  return { label: (apple && shortcut.apple) || shortcut.label, keys: shortcut.keys };
}
