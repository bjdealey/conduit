import type { Issue } from "../data/types";
import { PRIORITIES } from "../data/types";
import { workspaceControls } from "../data/workspaceControls";
import { matchesQuery, ordered, passesFilter, resolveSort, type WorkspaceState } from "./workspace";

/* =============================================================================
   Shared selectors
   -----------------------------------------------------------------------------
   Applying a page's workspace controls to its rows. Pages whose panes live in one
   file do this inline; this module holds the selectors that more than one
   component needs, so the panes can't drift apart — the inbox list and the board
   must always show the same narrowed set.
   ============================================================================= */

/** Least urgent → most, so the shared descending default reads High first. */
const urgency = (issue: Issue) => PRIORITIES.length - 1 - PRIORITIES.indexOf(issue.priority);

/** Ascending comparators; the header's direction flips them (see `ordered`). */
const COMPARE: Record<string, (a: Issue, b: Issue) => number> = {
  priority: (a, b) => urgency(a) - urgency(b) || a.impactedUsers - b.impactedUsers,
  impact: (a, b) => a.impactedUsers - b.impactedUsers,
  id: (a, b) => a.id - b.id,
};

/** Issues narrowed by the inbox's search + filters, in the chosen sort order and
 *  direction. Shared by the list pane (<Inbox>) and the kanban (<Board>). */
export function visibleIssues(issues: Issue[], state: WorkspaceState): Issue[] {
  const rows = issues.filter(
    (issue) =>
      matchesQuery(state.query, [issue.title, issue.id, issue.surface.join(" ")]) &&
      passesFilter(state, "status", issue.status) &&
      passesFilter(state, "priority", issue.priority) &&
      passesFilter(state, "assignee", issue.assigneeId),
  );

  const { id, dir } = resolveSort(state, workspaceControls("inbox", "")?.sorts ?? []);
  return ordered(rows, dir, COMPARE[id] ?? COMPARE.priority);
}
