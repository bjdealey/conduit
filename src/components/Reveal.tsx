import { useEffect, useRef, type ReactNode } from "react";

/**
 * A height-animated disclosure: content slides open and closed rather than
 * appearing and vanishing.
 *
 * Animating to a content height nobody measured is the awkward part. This uses
 * the grid trick — a single-row grid animating `0fr → 1fr` — because it
 * interpolates to the content's *natural* height with no ref measuring, no
 * ResizeObserver, and no magic `max-height` that either clips tall content or
 * spends half the transition animating empty space.
 *
 * The price is that the children stay mounted while closed, which is what makes
 * a close animation possible at all — there is nothing to animate out of a
 * subtree React has already unmounted. Closed content is therefore made `inert`,
 * so a collapsed branch can't be reached by tab or read out by a screen reader
 * just because it's still in the DOM.
 *
 * Callers keep their own open state; this only animates it.
 */
export function Reveal({
  open,
  /** Milliseconds. Kept short — this is a disclosure, not a transition. */
  duration = 180,
  children,
}: {
  open: boolean;
  duration?: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);

  // `inert` as a property rather than a JSX attribute: React 18 has no typing for
  // it, and toggleAttribute needs no cast to say the same thing.
  useEffect(() => {
    box.current?.toggleAttribute("inert", !open);
  }, [open]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: `grid-template-rows ${duration}ms ease-out`,
      }}
    >
      {/* minHeight:0 lets the row shrink below its content; overflow hides what
          hasn't been revealed yet. */}
      <div ref={box} style={{ overflow: "hidden", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
