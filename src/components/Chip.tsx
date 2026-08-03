import type { ReactNode } from "react";

/**
 * A status pill: a tinted capsule carrying a short state word, optionally led by
 * a solid dot.
 *
 * Colour comes from a Radix accent name rather than a literal, using the three
 * steps the app already pairs for this: `-a3` for the tint, `-a11` for the text,
 * `-9` for the dot. Passing the accent (`"grass"`, `"tomato"`, …) keeps a chip on
 * the palette in both themes.
 *
 * Two shapes, because the app genuinely uses two:
 *  - default — a sans capsule, for lifecycle and status words (Active, Healthy,
 *    Paused, admin). This is what seven of the app's eight status pills already
 *    were.
 *  - `mono` — a tighter, squarer, monospace tag for run states, which sit beside
 *    monospace run ids in the run tables and timeline and read as technical
 *    tokens rather than prose.
 *
 * Never colour alone: every chip carries its label, so state survives for anyone
 * who can't distinguish the tints.
 */
export function Chip({
  tone,
  dot = true,
  mono = false,
  className = "",
  children,
}: {
  /** Radix accent name — "grass", "tomato", "amber", "blue", "gray", … */
  tone: string;
  /** Show the leading solid dot. */
  dot?: boolean;
  /** Monospace tag shape, for run states. */
  mono?: boolean;
  /** Layout-only utilities from the call site (ml-auto, shrink-0, w-fit…). */
  className?: string;
  children: ReactNode;
}) {
  const shape = mono
    ? "rounded-md px-1.5 py-0.5 font-departure-mono text-[0.65rem]"
    : "rounded-full px-2 py-0.5 text-[0.72rem]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium ${shape} ${className}`.trim()}
      style={{ background: `var(--${tone}-a3)`, color: `var(--${tone}-a11)` }}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${tone}-9)` }} />}
      {children}
    </span>
  );
}
