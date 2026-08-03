import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* =============================================================================
   Row action menu
   -----------------------------------------------------------------------------
   The "…" menu a library row hangs its edits off. Built as one panel that can
   swap its own contents rather than as nested popovers: "Move to" replaces the
   panel with a destination list, "Delete" replaces it with a confirm, and both
   have a way back. A submenu that opens sideways out of a 15rem tree pane has
   nowhere to go on a narrow window, and a confirm dialog for a rename in a file
   tree is heavier than the act it guards.

   The panel is **portalled to the body and positioned fixed**, not absolutely
   inside the row. A tree row sits inside a scrolling pane and inside a <Reveal>'s
   `overflow: hidden` — five clipping ancestors deep in places — and an absolutely
   positioned panel is clipped by every one of them, which is how "Delete" ended
   up sliced off the bottom of a menu. z-index cannot fix that: overflow clips
   regardless of stacking. Leaving the box is the only fix.
   ============================================================================= */

/** Gap between the trigger and the panel, and the minimum margin the panel keeps
 *  from a viewport edge. */
const GAP = 4;
/** Roughly the tallest a panel gets — decides whether it opens up or down. */
const PANEL_MAX = 280;

/** One row in a menu panel. */
export type ActionItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shown under the label — a folder's path, a destination's parent. */
  detail?: string;
  /** Destructive items read in the critical palette. */
  danger?: boolean;
  /** Items that swap the panel rather than act — "Move to…", "Delete" — keep the
   *  menu open, or the panel they asked for would never be seen. */
  keepOpen?: boolean;
  onSelect: () => void;
};

/** A panel of items under an optional heading, with an optional way back. */
export type MenuPanel = {
  heading?: string;
  /** Free text above the items — the confirm's tally, a refusal's reason. */
  note?: string;
  items: ActionItem[];
  onBack?: () => void;
  /** Show the panel's items in a scrolling box (long destination lists). */
  scroll?: boolean;
};

function Item({ item, onDone }: { item: ActionItem; onDone: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        item.onSelect();
        if (!item.keepOpen) onDone();
      }}
      className="focusable flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-transparent-hover"
    >
      {item.icon && (
        <span
          className="flex size-4 shrink-0 items-center justify-center"
          style={{ color: item.danger ? "var(--tomato-a11)" : "var(--color-tertiary-foreground)" }}
        >
          {item.icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className="truncate text-body-sm"
          style={{ color: item.danger ? "var(--tomato-a11)" : "var(--color-primary-foreground)" }}
        >
          {item.label}
        </span>
        {item.detail && <span className="truncate text-[0.7rem] text-tertiary-foreground">{item.detail}</span>}
      </span>
    </button>
  );
}

/**
 * A popover menu anchored to a trigger the caller renders.
 *
 * `panel` is a function of the current panel id, so the caller decides what
 * "Move to" or "Delete" swaps in. The menu owns only which panel is showing and
 * closes on Escape, an outside click, or any item that doesn't ask to stay.
 */
export function ActionMenu({
  label,
  trigger: triggerContent,
  panel,
  align = "left",
  open,
  openTo,
  onOpenChange,
}: {
  /** Accessible name for the trigger. */
  label: string;
  /** What the trigger button renders — usually the "…" glyph. */
  trigger: ReactNode;
  /** Build the panel showing now. `go` swaps panels without closing. */
  panel: (id: string, go: (next: string) => void) => MenuPanel;
  align?: "left" | "right";
  /** Controlled open state, for a menu opened from somewhere else (a right-click). */
  open?: boolean;
  /** Which panel to show when it opens — so a Delete shortcut can land straight
   *  on the confirm instead of making you walk the menu to it. */
  openTo?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isOpen = open ?? uncontrolled;
  const [panelId, setPanelId] = useState(openTo ?? "root");
  const trigger = useRef<HTMLButtonElement>(null);
  const panelBox = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    origin: string;
  } | null>(null);

  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
    // Always reopen on the root panel — a menu that remembers it was last on
    // "Delete" is a menu that arms a destructive action behind one click.
    if (!next) setPanelId("root");
  };

  // A controlled open that names a panel starts there — the Delete shortcut opens
  // straight onto the confirm. It keys off `openTo` changing rather than off every
  // render, so choosing "Move to…" by hand isn't immediately undone.
  //
  // This has to be an effect, not a render-phase guard: a ref mutated during
  // render is exactly the impurity StrictMode's double invocation is built to
  // expose, and it did — the first pass set the ref, the second pass saw it
  // already set and skipped the update React actually kept.
  useLayoutEffect(() => {
    if (isOpen) setPanelId(openTo ?? "root");
  }, [isOpen, openTo]);

  // Measured off the trigger before paint, and again when the panel swaps, since
  // a destination list is a different height from the root menu and may need to
  // open the other way.
  useLayoutEffect(() => {
    if (!isOpen) return setPlacement(null);
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const flip = below < PANEL_MAX && r.top > below;
    setPlacement({
      ...(flip ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      // Pinning an edge rather than computing a left from a width we don't know
      // yet keeps the panel aligned whatever it ends up containing.
      ...(align === "right" ? { right: Math.max(GAP, window.innerWidth - r.right) } : { left: Math.max(GAP, r.left) }),
      origin: `${flip ? "bottom" : "top"} ${align}`,
    });
  }, [isOpen, align, panelId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    // A fixed panel doesn't travel with its row, so scrolling the tree away from
    // it would leave it floating over unrelated UI. Scrolling *inside* the panel
    // (a long destination list) is not that, and must not close it.
    const onScroll = (e: Event) => {
      if (panelBox.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [isOpen]);

  const current = panel(panelId, setPanelId);

  return (
    <span className="relative inline-flex shrink-0 items-center">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!isOpen);
        }}
        className="focusable flex size-6 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
      >
        {triggerContent}
      </button>

      {isOpen &&
        placement &&
        createPortal(
        <>
          <span className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setOpen(false)} />
          <span
            ref={panelBox}
            role="menu"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            className="pop-in fixed flex flex-col rounded-xl border-border-default border-[0.5px] bg-page p-1.5"
            style={{
              zIndex: 50,
              top: placement.top,
              bottom: placement.bottom,
              left: placement.left,
              right: placement.right,
              minWidth: 208,
              maxWidth: 288,
              transformOrigin: placement.origin,
              boxShadow: "var(--s-popover)",
            }}
          >
            {(current.heading || current.onBack) && (
              <span className="flex items-center gap-1.5 px-2 pb-1 pt-1">
                {current.onBack && (
                  <button
                    type="button"
                    onClick={current.onBack}
                    className="focusable rounded text-[0.7rem] text-tertiary-foreground transition-colors hover:text-primary-foreground"
                  >
                    ←
                  </button>
                )}
                <span className="truncate font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
                  {current.heading}
                </span>
              </span>
            )}
            {current.note && (
              <span className="block px-2 pb-1.5 pt-0.5 text-[0.72rem] leading-snug text-secondary-foreground">
                {current.note}
              </span>
            )}
            <span
              className={"flex flex-col " + (current.scroll ? "scrollbar-none overflow-y-auto" : "")}
              style={current.scroll ? { maxHeight: 260 } : undefined}
            >
              {current.items.map((item) => (
                <Item key={item.id} item={item} onDone={() => setOpen(false)} />
              ))}
              {current.items.length === 0 && (
                <span className="px-2 py-2 text-body-sm text-tertiary-foreground">Nowhere to put it.</span>
              )}
            </span>
          </span>
        </>,
          document.body,
        )}
    </span>
  );
}
