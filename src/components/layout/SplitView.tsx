import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { useStore } from "../../store";
import { Sheet } from "../Sheet";

/* =============================================================================
   Shared multi-pane layout primitives
   -----------------------------------------------------------------------------
   Every list/detail view in the app is built from the same horizontal shell:

     <SplitView>
       [NavPane]   optional leading navigation column (e.g. a folder tree)
       [ListPane]  optional collection column (issues, users, workflows…)
       <DetailPane>  the primary content column (always present)
       [ContextPane] optional right-hand "more info" column (collapsible)
     </SplitView>

   Standardising widths, borders, and scroll here is what makes the pages read as
   one system. The ContextPane collapses/expands from a single titlebar control
   (store: `infoPaneOpen`), so the third pane behaves identically everywhere.

   On a phone the same shell becomes a stack of full-screen steps, and it happens
   here rather than in each view: three columns at 390px is three unusable
   columns, and thirteen views each inventing their own answer to that is thirteen
   answers to keep in step. A view declares which pane *is* the phone screen right
   now (`mobile`), and the primitives do the rest — see `SplitView` below.
   ============================================================================= */

const BORDER = "0.5px solid var(--color-border-default)";

/** Canonical pane widths, shared across every view. */
export const PANE_WIDTH = {
  /** Leading navigation rail (folder trees, section nav). */
  nav: "15rem",
  /** Primary collection list (issues, users, workflows, incidents). */
  list: "20rem",
  /** Right-hand context / summary pane. */
  context: "24rem",
} as const;

/**
 * Which pane a phone is showing.
 *
 * - `"list"` — the collection fills the screen; the detail isn't mounted.
 * - `"detail"` — the opened item fills the screen; the collection isn't mounted.
 *
 * A view that never drills (a board, a dashboard, a single-pane report) declares
 * nothing and keeps every pane on both shells.
 */
export type MobilePane = "list" | "detail";

/** What the panes need to know about the shell they're in. `null` outside a
 *  `<SplitView>` — `IssueDetail` renders its two panes straight into the body in
 *  board mode, and must keep working there. */
const SplitContext = createContext<{ mobile: MobilePane | null }>({ mobile: null });

/**
 * The horizontal shell that lays panes out in a row.
 *
 * `mobile` is the drill-in declaration: pass the pane that should *be* the phone
 * screen right now — almost always `selected ? "detail" : "list"`. On a phone
 * the other pane is not rendered (not merely hidden), so a list of 200 rows
 * isn't sitting in the DOM under the detail you're reading, and the pane that is
 * shown gets the full width. On desktop `mobile` has no effect at all.
 */
export function SplitView({
  children,
  className = "",
  mobile,
}: {
  children: ReactNode;
  className?: string;
  mobile?: MobilePane;
}) {
  const { isMobile } = useStore();
  return (
    <SplitContext.Provider value={{ mobile: isMobile ? mobile ?? null : null }}>
      <div className={"flex min-h-0 min-w-0 flex-1 " + className}>{children}</div>
    </SplitContext.Provider>
  );
}

/** A fixed-width column with a standard hairline border on one side. Used for the
 *  leading nav and the collection list panes.
 *
 *  This is the "list" half of a drill-in: on a phone showing the detail it
 *  doesn't render, and otherwise it drops its fixed width and its divider to
 *  become the screen. */
export function Pane({
  width,
  side = "right",
  scroll = false,
  className = "",
  style,
  children,
}: {
  width: string;
  side?: "left" | "right" | "none";
  scroll?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { mobile } = useContext(SplitContext);
  if (mobile === "detail") return null;

  const border: CSSProperties =
    side === "right" ? { borderRight: BORDER } : side === "left" ? { borderLeft: BORDER } : {};
  // Full-width and no divider when it *is* the screen: there is nothing beside it
  // for the hairline to separate it from.
  const sized: CSSProperties = mobile === "list" ? { width: "100%" } : { width, ...border };
  return (
    <div className={"flex shrink-0 flex-col " + className} style={{ ...sized, ...style }}>
      {scroll ? <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div> : children}
    </div>
  );
}

/** The primary, flex-filling content column. The "detail" half of a drill-in. */
export function DetailPane({ className = "", children }: { className?: string; children: ReactNode }) {
  const { mobile } = useContext(SplitContext);
  if (mobile === "list") return null;
  return <div className={"flex min-w-0 flex-1 flex-col " + className}>{children}</div>;
}

/**
 * Right-hand supplementary pane. On desktop it collapses (width-animated) to
 * nothing when the titlebar's info-panel toggle is off, so every view's third
 * pane shows/hides the same way; content stays mounted and is clip-revealed as
 * the width animates.
 *
 * On a phone the same toggle opens it as a bottom sheet instead. It is a third
 * column of supplementary detail — there is no third column on a phone, and
 * stacking it under the detail would bury the thing you opened. The sheet keeps
 * it one tap away from every view, which matters most in the builder, where the
 * pane is where a step is actually configured.
 */
export function ContextPane({
  width = PANE_WIDTH.context,
  scroll = true,
  className = "",
  children,
}: {
  width?: string;
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { infoPaneOpen, setInfoPaneOpen, isMobile, contextLabel } = useStore();

  if (isMobile) {
    return (
      <Sheet open={infoPaneOpen} onClose={() => setInfoPaneOpen(false)} title={contextLabel}>
        <div className={"flex flex-col " + className}>{children}</div>
      </Sheet>
    );
  }

  return (
    <div
      aria-hidden={!infoPaneOpen}
      className="shrink-0 overflow-hidden transition-[width] duration-200 ease-out"
      style={{
        width: infoPaneOpen ? width : "0px",
        borderLeft: infoPaneOpen ? BORDER : "none",
        pointerEvents: infoPaneOpen ? "auto" : "none",
      }}
    >
      <div
        className={"flex h-full flex-col " + (scroll ? "scrollbar-none overflow-y-auto " : "") + className}
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}

/** Centered placeholder shown in a DetailPane slot when nothing is selected.
 *  Follows the detail: on a phone showing the list, "select an item" is advice
 *  about a pane that isn't on screen. */
export function EmptyDetail({ children }: { children: ReactNode }) {
  const { mobile } = useContext(SplitContext);
  if (mobile === "list") return null;
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-body-base text-tertiary-foreground">
      {children}
    </div>
  );
}
