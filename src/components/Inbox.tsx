import { useMemo } from "react";
import { useStore } from "../store";
import { STATUSES, type Issue, type Status } from "../data/types";
import { isNarrowed } from "../lib/workspace";
import { IssueRow } from "./IssueRow";
import { Pane, PANE_WIDTH } from "./layout/SplitView";

/** Left column: the issues grouped by workflow status. `issues` arrives already
 *  narrowed and ordered by the workspace header (see `visibleIssues`), so this
 *  pane and the board always show the same set. */
export function Inbox({ issues }: { issues: Issue[] }) {
  const { controls } = useStore();
  const narrowed = isNarrowed(controls("activity/issues"));

  const groups = useMemo(() => {
    const by: Record<Status, Issue[]> = {
      "Under Investigation": [],
      Active: [],
      "In Recovery": [],
      Resolved: [],
    };
    for (const i of issues) by[i.status].push(i);
    return STATUSES.map((s) => ({ status: s, items: by[s] })).filter((g) => g.items.length > 0);
  }, [issues]);

  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No issues match the current search or filters." : "No issues. A failed run opens one here."}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.status} className="mb-2">
            <header className="flex items-center gap-2 px-3 py-2">
              <span className="font-sans font-medium text-body-sm text-secondary-foreground">{group.status}</span>
              <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{group.items.length}</span>
            </header>
            <div className="flex flex-col gap-0.5">
              {group.items.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Pane>
  );
}
