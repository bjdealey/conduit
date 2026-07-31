import type { CSSProperties } from "react";

/** Selected rail items render as a white "card" that lifts off the shell — a
 *  hairline ring plus a soft shadow (shared by NavItem and OpenItem). */
export const ACTIVE_ITEM_STYLE: CSSProperties = {
  background: "var(--color-page)",
  boxShadow: "var(--s-default)",
};
