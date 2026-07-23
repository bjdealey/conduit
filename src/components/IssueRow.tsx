import { useStore } from "../store";
import type { Issue } from "../data/types";
import { Avatar } from "./Avatar";
import { PriorityBadge } from "./Badges";
import { num } from "../lib/format";

/** A single issue row in the inbox list. */
export function IssueRow({ issue }: { issue: Issue }) {
  const { selectedId, select, memberById } = useStore();
  const member = memberById(issue.assigneeId);
  const active = issue.id === selectedId;

  return (
    <button
      type="button"
      onClick={() => select(issue.id)}
      aria-current={active ? "true" : undefined}
      className="focusable flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
      style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
    >
      <span className="w-9 shrink-0 font-departure-mono text-[0.7rem] text-tertiary-foreground">
        #{issue.id}
      </span>
      {member && <Avatar member={member} size={20} />}
      <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{issue.title}</span>
      <PriorityBadge priority={issue.priority} />
      <span className="w-14 shrink-0 text-right font-departure-mono text-[0.7rem] text-tertiary-foreground">
        {num(issue.impactedUsers)}
      </span>
    </button>
  );
}
