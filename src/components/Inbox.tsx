import { useMemo } from "react";
import { useStore } from "../store";
import { STATUSES, type Issue, type Status } from "../data/types";
import { IssueRow } from "./IssueRow";
import { Pane, PANE_WIDTH } from "./layout/SplitView";
import { ListSearch } from "./ListSearch";

/** Left column: search + issues grouped by workflow status. */
export function Inbox() {
  const { issues, query, setQuery } = useStore();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(
      (i) => i.title.toLowerCase().includes(q) || String(i.id).includes(q),
    );
  }, [issues, query]);

  const groups = useMemo(() => {
    const by: Record<Status, Issue[]> = {
      "Under Investigation": [],
      Active: [],
      "In Recovery": [],
      Resolved: [],
    };
    for (const i of filtered) by[i.status].push(i);
    return STATUSES.map((s) => ({ status: s, items: by[s] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <Pane width={PANE_WIDTH.list}>
      <ListSearch value={query} onChange={setQuery} placeholder="Search issues…" />

      {/* Grouped list */}
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">No issues match “{query}”.</p>
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
