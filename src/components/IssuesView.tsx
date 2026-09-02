import { useStore } from "../store";
import { visibleIssues } from "../lib/select";
import { Inbox } from "./Inbox";
import { Board } from "./Board";
import { IssueDetail } from "./IssueDetail";
import { SplitView, DetailPane, EmptyDetail } from "./layout/SplitView";

/**
 * Activity → Issues: the work a run left behind.
 *
 * A subpage of Activity rather than a destination of its own. A failed run and
 * the issue it opens are one event at two fidelities, and `ActivityView` already
 * carries the same collection in its incidents rail — scoped to the selected
 * workflow there, whole here. Two rail items for one stream was the split that
 * made this read as a separate product.
 */
export function IssuesView() {
  const { issues, selected, viewMode, controls } = useStore();
  // One narrowed set for both layouts — the workspace header drives them together.
  const visible = visibleIssues(issues, controls("activity/issues"));

  // Board layout: the kanban fills the panel; selecting a card opens the issue
  // (detail + collapsible context) full-width — deselect returns to the board.
  if (viewMode("activity/issues") === "board") {
    if (selected) return <IssueDetail issue={selected} />;
    return (
      <DetailPane>
        <Board issues={visible} />
      </DetailPane>
    );
  }

  // List layout: the grouped list, the activity detail, and the issue's details
  // in the shared right-hand context pane. On a phone those are three steps
  // rather than three columns — the list is the screen until you open an issue.
  return (
    <SplitView mobile={selected ? "detail" : "list"}>
      <Inbox issues={visible} />
      {selected ? <IssueDetail issue={selected} /> : <EmptyDetail>Select an issue from the list.</EmptyDetail>}
    </SplitView>
  );
}
