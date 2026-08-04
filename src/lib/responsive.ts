import { useEffect, useState } from "react";

/* =============================================================================
   The mobile breakpoint
   -----------------------------------------------------------------------------
   The app has one breakpoint, not a scale of them, because there are only two
   shells: the desktop one (a persistent rail beside two or three panes) and the
   phone one (a bottom bar under a single pane you drill into). Anything between
   those is the desktop shell with less room, which it handles by collapsing the
   rail and the context pane — controls that already exist.

   The width is the same number in CSS and in TypeScript. The layout *structure*
   is a React decision (which pane is on screen, which nav renders), so it can't
   be done in CSS alone; the type and tap-target scaling is a CSS decision. Both
   read 767px, and `MOBILE_QUERY` is the single place it's written down.
   ============================================================================= */

/** Widest viewport that gets the phone shell. One below the usual 768px tablet
 *  breakpoint, so a portrait tablet keeps the desktop layout it has room for. */
export const MOBILE_MAX_PX = 767;

/** The media query behind `useIsMobile`. Mirrored by the `@media` block in
 *  `src/styles/app.css` — change both together. */
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_PX}px)`;

/**
 * Whether the viewport is phone-sized *right now*, read synchronously.
 *
 * Used by `useState` initialisers that have to decide something on the very
 * first render — the store's opening selections, chiefly, since "nothing is
 * open" is the phone's correct starting state and a post-mount correction would
 * flash a detail pane on the way past. Returns false where there is no
 * `matchMedia` (the Node test runner), which is the desktop shell.
 */
export function isMobileNow(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(MOBILE_QUERY).matches;
}

/**
 * Live mobile flag. Re-renders on breakpoint changes, so rotating a phone or
 * dragging a desktop window narrow swaps shells without a reload.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileNow);

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    // Re-read on mount as well as on change: the first paint can precede the
    // browser settling on a final viewport width (mobile URL bars, zoom).
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

/**
 * Split a nav list into the items that get a slot on the bottom bar and the
 * items that go behind "More".
 *
 * `bar` names the destinations worth a permanent slot, in the order they should
 * appear; `items` is the list *after* role and capability gating, so a
 * destination the current tier can't reach never takes a slot it can't use.
 * Everything not named — or past `max` — falls into the overflow in its original
 * order, which keeps the sheet reading like the sidebar it replaces.
 *
 * Pure and exported for its own sake: the bar's contents are a rule worth
 * testing, and testing it through a rendered nav would prove far less.
 */
export function splitDestinations<T extends { id: string }>(
  items: readonly T[],
  bar: readonly string[],
  max: number,
): { bar: T[]; overflow: T[] } {
  const promoted: T[] = [];
  for (const id of bar) {
    if (promoted.length >= max) break;
    const item = items.find((i) => i.id === id);
    if (item) promoted.push(item);
  }
  const promotedIds = new Set(promoted.map((i) => i.id));
  return { bar: promoted, overflow: items.filter((i) => !promotedIds.has(i.id)) };
}
