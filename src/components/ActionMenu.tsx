import { useEffect, useRef, useState, type ReactNode } from "react";

/* =============================================================================
   Row action menu
   -----------------------------------------------------------------------------
   The "…" menu a library row hangs its edits off. Built as one panel that can
   swap its own contents rather than as nested popovers: "Move to" replaces the
   panel with a destination list, "Delete" replaces it with a confirm, and both
   have a way back. A submenu that opens sideways out of a 15rem tree pane has
   nowhere to go on a narrow window, and a confirm dialog for a rename in a file
   tree is heavier than the act it guards.
   ============================================================================= */

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
  trigger,
  panel,
  align = "left",
  open,
  onOpenChange,
}: {
  /** Accessible name for the trigger. */
  label: string;
  trigger: ReactNode;
  /** Build the panel showing now. `go` swaps panels without closing. */
  panel: (id: string, go: (next: string) => void) => MenuPanel;
  align?: "left" | "right";
  /** Controlled open state, for a menu opened from somewhere else (a right-click). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isOpen = open ?? uncontrolled;
  const [panelId, setPanelId] = useState("root");
  const box = useRef<HTMLSpanElement>(null);

  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
    // Always reopen on the root panel — a menu that remembers it was last on
    // "Delete" is a menu that arms a destructive action behind one click.
    if (!next) setPanelId("root");
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const current = panel(panelId, setPanelId);

  return (
    <span ref={box} className="relative inline-flex shrink-0 items-center">
      <button
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
        {trigger}
      </button>

      {isOpen && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setOpen(false)} />
          <span
            role="menu"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            className="pop-in absolute flex flex-col rounded-xl border-border-default border-[0.5px] bg-page p-1.5"
            style={{
              zIndex: 50,
              top: "calc(100% + 4px)",
              ...(align === "right" ? { right: 0 } : { left: 0 }),
              minWidth: 208,
              maxWidth: 288,
              transformOrigin: align === "right" ? "top right" : "top left",
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
        </>
      )}
    </span>
  );
}
