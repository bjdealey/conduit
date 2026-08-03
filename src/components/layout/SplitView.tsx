import type { CSSProperties, ReactNode } from "react";
import { useStore } from "../../store";

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

/** The horizontal shell that lays panes out in a row. */
export function SplitView({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"flex min-h-0 min-w-0 flex-1 " + className}>{children}</div>;
}

/** A fixed-width column with a standard hairline border on one side. Used for the
 *  leading nav and the collection list panes. */
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
  const border: CSSProperties =
    side === "right" ? { borderRight: BORDER } : side === "left" ? { borderLeft: BORDER } : {};
  return (
    <div
      className={"flex shrink-0 flex-col " + className}
      style={{ width, ...border, ...style }}
    >
      {scroll ? <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div> : children}
    </div>
  );
}

/** The primary, flex-filling content column. */
export function DetailPane({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={"flex min-w-0 flex-1 flex-col " + className}>{children}</div>;
}

/** Right-hand supplementary pane. Collapses (width-animated) to nothing when the
 *  titlebar's info-panel toggle is off, so every view's third pane shows/hides the
 *  same way. Content stays mounted and is clip-revealed as the width animates. */
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
  const { infoPaneOpen } = useStore();
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

/** Centered placeholder shown in a DetailPane slot when nothing is selected. */
export function EmptyDetail({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-body-base text-tertiary-foreground">
      {children}
    </div>
  );
}
