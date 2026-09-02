import type { ReactNode } from "react";
import { Button } from "./Button";

/* =============================================================================
   Empty states
   -----------------------------------------------------------------------------
   Conduit ships empty. Not "empty until the demo data loads" — empty, because a
   fresh install has no estate, no pool and no history until someone connects a
   platform or authors something. That makes the empty state the *first* screen a
   real user sees on almost every view, not an edge case.

   So the rules here are the ones a first screen has to follow:

   - **Say what is missing, in the page's own words.** "No runners registered"
     tells you which collection is empty; "Nothing here" tells you the page is
     broken.
   - **Offer the one action that fills it, and only when it is genuinely the next
     step.** A view whose collection fills itself (Activity fills when a run
     starts, Audit when something is approved) gets an explanation instead of a
     button — a button that can't do anything is worse than no button.
   - **Never blame the reader.** An empty pool on a new install is the expected
     state, not a misconfiguration.

   Two shapes, because empties appear in two places: `EmptyState` fills a pane,
   `EmptyPanel` sits inside a bordered card on a dashboard.
   ============================================================================= */

/** The one action an empty state offers, when there is one. */
export type EmptyAction = { label: string; onSelect: () => void };

/**
 * A pane-filling empty state — the whole of a list or detail column when its
 * collection is empty.
 *
 * `icon` is optional and deliberately understated: this is the ordinary state of
 * a new install, so it gets the same quiet treatment as an empty inbox, not an
 * illustration that turns "nothing has happened yet" into an event.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: EmptyAction;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`.trim()}
    >
      {icon && <span className="text-tertiary-foreground">{icon}</span>}
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-body-base font-medium text-primary-foreground">{title}</p>
        {body && <p className="text-body-sm leading-relaxed text-tertiary-foreground">{body}</p>}
      </div>
      {action && (
        <Button variant="outlined" onClick={action.onSelect}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * The panel-sized empty — used inside a dashboard card, where the surrounding
 * border already frames it and a full pane's worth of padding would leave the
 * card taller than the ones beside it.
 */
export function EmptyPanel({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: EmptyAction;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border-border-default border-[0.5px] bg-page px-4 py-4 shadow-default">
      <div className="flex flex-col gap-1">
        <span className="text-body-sm font-medium text-primary-foreground">{title}</span>
        {body && <span className="text-body-sm leading-relaxed text-tertiary-foreground">{body}</span>}
      </div>
      {action && (
        <Button variant="outlined" size="sm" onClick={action.onSelect}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * The one-line empty used inside a list that already has a heading — a row slot
 * rather than a panel, so a short list doesn't grow a card inside a card.
 */
export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-body-sm text-tertiary-foreground">{children}</p>;
}
