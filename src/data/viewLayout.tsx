import type { ReactNode } from "react";
import { ChartGantt, Columns3, LayoutGrid, List, Workflow as WorkflowIcon } from "lucide-react";
import type { Section } from "./nav";

/* =============================================================================
   Per-section layout configuration
   -----------------------------------------------------------------------------
   Declarative descriptors that the titlebar and views share, so the presentation
   controls (the Board/List-style mode switcher and the collapsible info pane) are
   driven from one place instead of hard-coded per page. A screen "opts in" simply
   by appearing here.

   Keyed by `Section`, not `View`: two subpages of one destination are two screens
   with two answers — Workflows' Library has a board, its Triggers is one table.
   ============================================================================= */

/** One selectable presentation mode for a view (rendered as a segmented switch). */
export type ViewMode = { id: string; label: string; icon: ReactNode };

const icon = { size: 14, strokeWidth: 1.8 } as const;

/** Sections that offer more than one presentation. The switcher only appears when
 *  a section has an entry here; the first mode is the default. */
export const VIEW_MODES: Partial<Record<Section, ViewMode[]>> = {
  builder: [
    { id: "steps", label: "Steps", icon: <List {...icon} /> },
    { id: "diagram", label: "Diagram", icon: <WorkflowIcon {...icon} /> },
  ],
  "activity/runs": [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "timeline", label: "Timeline", icon: <ChartGantt {...icon} /> },
  ],
  "activity/issues": [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "board", label: "Board", icon: <Columns3 {...icon} /> },
  ],
  "workflows/library": [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "board", label: "Board", icon: <Columns3 {...icon} /> },
  ],
  runners: [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "grid", label: "Grid", icon: <LayoutGrid {...icon} /> },
  ],
};

/** Default mode for a section (its first declared mode, else "list"). */
export function defaultViewMode(section: Section): string {
  return VIEW_MODES[section]?.[0]?.id ?? "list";
}

/** Sections that render a right-hand context ("more info") pane, with the label
 *  shown on the titlebar toggle. Absence here means no info pane / no toggle. */
export const CONTEXT_LABEL: Partial<Record<Section, string>> = {
  "activity/issues": "Details",
  "activity/runs": "Incidents",
  "workflows/library": "Summary",
  runners: "Details",
  builder: "Configuration",
};
