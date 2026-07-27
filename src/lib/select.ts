import type { Issue } from "../data/types";
import { PRIORITIES } from "../data/types";
import { matchesQuery, passesFilter, type WorkspaceState } from "./workspace";

/* =============================================================================
   Shared selectors
   -----------------------------------------------------------------------------
   Applying a page's workspace controls to its rows. Pages whose panes live in one
   file do this inline; this module holds the selectors that more than one
   component needs, so the panes can't drift apart — the inbox list and the board
   must always show the same narrowed set.
   ============================================================================= */

/** High → Low, matching the order priorities are declared in. */
const priorityRank = (issue: Issue) => PRIORITIES.indexOf(issue.priority);

/** Issues narrowed by the inbox's search + filters, in the chosen sort order.
 *  Shared by the list pane (<Inbox>) and the kanban (<Board>). */
export function visibleIssues(issues: Issue[], state: WorkspaceState): Issue[] {
  const rows = issues.filter(
    (issue) =>
      matchesQuery(state.query, [issue.title, issue.id, issue.surface.join(" ")]) &&
      passesFilter(state, "status", issue.status) &&
      passesFilter(state, "priority", issue.priority) &&
      passesFilter(state, "assignee", issue.assigneeId),
  );

  const sorted = [...rows];
  switch (state.sort) {
    case "impact":
      sorted.sort((a, b) => b.impactedUsers - a.impactedUsers);
      break;
    case "id":
      sorted.sort((a, b) => b.id - a.id);
      break;
    // "priority" is the default: rank first, then by blast radius.
    default:
      sorted.sort((a, b) => priorityRank(a) - priorityRank(b) || b.impactedUsers - a.impactedUsers);
  }
  return sorted;
}
