import type { CSSProperties } from "react";

/** Selected rail items render as a white "card" that lifts off the shell — a
 *  hairline ring plus a soft shadow (shared by NavItem and OpenItem). */
export const ACTIVE_ITEM_STYLE: CSSProperties = {
  background: "var(--color-page)",
  boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 2px 0 rgba(0,0,0,0.06)",
};
