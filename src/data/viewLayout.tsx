import type { ReactNode } from "react";
import { ChartGantt, Columns3, LayoutGrid, List, Workflow } from "lucide-react";
import type { View } from "../store";

/* =============================================================================
   Per-view layout configuration
   -----------------------------------------------------------------------------
   Declarative descriptors that the titlebar and views share, so the presentation
   controls (the Board/List-style mode switcher and the collapsible info pane) are
   driven from one place instead of hard-coded per page. A view "opts in" simply by
   appearing here.
   ============================================================================= */

/** One selectable presentation mode for a view (rendered as a segmented switch). */
export type ViewMode = { id: string; label: string; icon: ReactNode };

const icon = { size: 14, strokeWidth: 1.8 } as const;

/** Views that offer more than one presentation. The switcher only appears when a
 *  view has an entry here; the first mode is the default. */
export const VIEW_MODES: Partial<Record<View, ViewMode[]>> = {
  builder: [
    { id: "steps", label: "Steps", icon: <List {...icon} /> },
    { id: "diagram", label: "Diagram", icon: <Workflow {...icon} /> },
  ],
  activity: [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "timeline", label: "Timeline", icon: <ChartGantt {...icon} /> },
  ],
  inbox: [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "board", label: "Board", icon: <Columns3 {...icon} /> },
  ],
  users: [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "grid", label: "Grid", icon: <LayoutGrid {...icon} /> },
  ],
  automations: [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "board", label: "Board", icon: <Columns3 {...icon} /> },
  ],
  runners: [
    { id: "list", label: "List", icon: <List {...icon} /> },
    { id: "grid", label: "Grid", icon: <LayoutGrid {...icon} /> },
  ],
};

/** Default mode for a view (its first declared mode, else "list"). */
export function defaultViewMode(view: View): string {
  return VIEW_MODES[view]?.[0]?.id ?? "list";
}

/** Views that render a right-hand context ("more info") pane, with the label shown
 *  on the titlebar toggle. Absence here means no info pane / no toggle. */
export const CONTEXT_LABEL: Partial<Record<View, string>> = {
  inbox: "Details",
  users: "Profile",
  automations: "Summary",
  surfaces: "Overview",
  activity: "Incidents",
  runners: "Details",
  builder: "Configuration",
};
