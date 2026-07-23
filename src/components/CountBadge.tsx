/** A small count badge for sidebar rail items (purely presentational — the
 *  parent positions and cross-fades the two variants).
 *  - `inline`  → a bordered pill next to the label (expanded sidebar).
 *  - `corner`  → a small badge on the icon's top-right corner (collapsed sidebar). */
export function CountBadge({ count, variant }: { count: number; variant: "inline" | "corner" }) {
  if (variant === "inline") {
    return (
      <span
        className="flex items-center justify-center rounded-md px-1.5 py-0.5 font-medium text-secondary-foreground"
        style={{
          fontSize: "0.72rem",
          minWidth: 22,
          background: "var(--color-page)",
          border: "0.5px solid var(--color-border-strong)",
        }}
      >
        {count}
      </span>
    );
  }

  return (
    <span
      className="flex items-center justify-center rounded-full font-departure-mono font-medium"
      style={{
        minWidth: 15,
        height: 15,
        padding: "0 3px",
        fontSize: "0.58rem",
        lineHeight: 1,
        background: "var(--gray-4)",
        color: "var(--color-secondary-foreground)",
        // Ring in the shell colour so the badge reads as separate from the tile.
        boxShadow: "0 0 0 2px var(--color-shell)",
      }}
    >
      {count}
    </span>
  );
}
