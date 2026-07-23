import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** One choice in a segmented control. `icon`/`badge` are optional adornments. */
export type Segment = { id: string; label: string; icon?: ReactNode; badge?: ReactNode };

type Rect = { left: number; top: number; width: number; height: number };

const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A segmented control whose selection highlight ("thumb") slides between options
 * — animated on click, and draggable: press and move across the segments and the
 * thumb follows, committing to whichever segment you release on.
 *
 * Two looks: `solid` (a white card thumb on a filled track — the inbox-style view
 * switcher) and `ghost` (a subtle pill — the page tab bars).
 */
export function SegmentedControl({
  segments,
  value,
  onChange,
  variant = "ghost",
  ariaLabel,
}: {
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  variant?: "solid" | "ghost";
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rects, setRects] = useState<Rect[]>([]);
  // While dragging, the previewed (not-yet-committed) index the thumb sits on.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const moved = useRef(false);
  const downX = useRef(0);

  const activeIndex = Math.max(
    0,
    segments.findIndex((s) => s.id === value),
  );
  const shownIndex = dragIndex ?? activeIndex;
  const solid = variant === "solid";

  // Measure each segment's box so the thumb can be placed over the active one.
  // Re-measured on resize and whenever the set of segments changes.
  const key = segments.map((s) => s.id).join("|");
  useLayoutEffect(() => {
    const measure = () => {
      setRects(
        segments.map((_, i) => {
          const el = itemRefs.current[i];
          return el
            ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }
            : { left: 0, top: 0, width: 0, height: 0 };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    itemRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const indexAtClientX = (clientX: number) => {
    const cr = containerRef.current?.getBoundingClientRect();
    if (!cr) return activeIndex;
    const x = clientX - cr.left;
    let best = 0;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
      const center = r.left + r.width / 2;
      const d = Math.abs(center - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  // Pointer interactions (mouse/touch/pen) select on release — for both a plain
  // click and a drag — because capturing the pointer redirects the follow-up
  // `click` event away from the buttons. Buttons keep an onClick purely for
  // keyboard activation (no pointer capture is involved there).
  const onPointerDown = (e: ReactPointerEvent) => {
    moved.current = false;
    downX.current = e.clientX;
    containerRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons === 0) return;
    // Ignore tiny jitter so a plain click doesn't visibly "drag".
    if (!moved.current && Math.abs(e.clientX - downX.current) < 4) return;
    moved.current = true;
    setDragIndex(indexAtClientX(e.clientX));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    onChange(segments[indexAtClientX(e.clientX)].id);
    setDragIndex(null);
    containerRef.current?.releasePointerCapture?.(e.pointerId);
  };
  const onPointerCancel = (e: ReactPointerEvent) => {
    setDragIndex(null);
    containerRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const thumb = rects[shownIndex];
  const transition = reduceMotion()
    ? undefined
    : "left 0.22s cubic-bezier(0.4,0,0.2,1), top 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s cubic-bezier(0.4,0,0.2,1), height 0.22s cubic-bezier(0.4,0,0.2,1)";

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={"relative flex items-center " + (solid ? "gap-0.5 rounded-lg bg-component p-0.5" : "gap-1")}
      style={{ touchAction: "none", userSelect: "none" }}
    >
      {thumb && thumb.width > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-md"
          style={{
            left: thumb.left,
            top: thumb.top,
            width: thumb.width,
            height: thumb.height,
            transition,
            background: solid ? "var(--color-page)" : "var(--color-transparent-hover)",
            boxShadow: solid ? "0 0 0 0.5px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        />
      )}
      {segments.map((s, i) => {
        const on = i === shownIndex;
        return (
          <button
            key={s.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={s.id === value}
            // Keyboard activation only; pointer selection is handled on pointerup.
            onClick={() => onChange(s.id)}
            className="pressable focusable relative z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm transition-colors"
            style={{
              color: on ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
              fontWeight: on || solid ? 500 : 400,
            }}
          >
            {s.icon}
            {s.label}
            {s.badge != null && (
              <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{s.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
