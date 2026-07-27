import { useMemo, type ReactNode } from "react";
import {
  BarChart3,
  Bug,
  CreditCard,
  Globe,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  Server,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { useStore } from "../store";
import { STATUSES, type Issue, type Status } from "../data/types";
import { STATUS_ACCENT, PriorityBadge } from "./Badges";
import { Avatar } from "./Avatar";
import { num } from "../lib/format";

/** Short, uppercase column titles (the workflow statuses read as board columns). */
const COLUMN_LABEL: Record<Status, string> = {
  "Under Investigation": "Investigating",
  Active: "Active",
  "In Recovery": "In Recovery",
  Resolved: "Resolved",
};

const iconProps = { size: 15, strokeWidth: 1.8 };

/** A representative glyph per surface, most-specific first. Falls back to a bug. */
const SURFACE_ICON: Record<string, ReactNode> = {
  Auth: <KeyRound {...iconProps} />,
  Payments: <CreditCard {...iconProps} />,
  Billing: <CreditCard {...iconProps} />,
  Search: <Search {...iconProps} />,
  Email: <Mail {...iconProps} />,
  Analytics: <BarChart3 {...iconProps} />,
  "iOS App": <Smartphone {...iconProps} />,
  Backend: <Server {...iconProps} />,
  Website: <Globe {...iconProps} />,
};
function surfaceIcon(surface: string[]): ReactNode {
  // Prefer the most specific surface (skip the broad "Website"/"Frontend" tags).
  const specific = surface.find((s) => s !== "Website" && s !== "Frontend");
  return SURFACE_ICON[specific ?? surface[0]] ?? <Bug {...iconProps} />;
}

/** Small live-signal chip echoing Conduit's auto-investigation (Investigating column). */
function SignalChip({ issue }: { issue: Issue }) {
  const reasoning = issue.regression;
  const Icon = reasoning ? RefreshCw : Sparkles;
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-tertiary-foreground">
      <Icon size={12} strokeWidth={1.8} />
      <span className="text-[0.72rem]">{reasoning ? "Reasoning" : "Detected"}</span>
    </span>
  );
}

function BoardCard({ issue }: { issue: Issue }) {
  const { select, memberById } = useStore();
  const member = memberById(issue.assigneeId);
  const investigating = issue.status === "Under Investigation";

  return (
    <button
      type="button"
      onClick={() => select(issue.id)}
      className="pressable focusable group flex w-full flex-col gap-2.5 rounded-xl border-border-default border-[0.5px] bg-page p-3 text-left shadow-default transition-colors hover:border-border-strong"
    >
      {/* Id + assignee */}
      <div className="flex items-center gap-2">
        <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
          PRB-{issue.id}
        </span>
        {member && (
          <span className="ml-auto">
            <Avatar member={member} size={18} />
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex items-start gap-2">
        <span className="mt-px shrink-0 text-tertiary-foreground">{surfaceIcon(issue.surface)}</span>
        <span className="min-w-0 flex-1 text-body-sm font-medium leading-5 text-primary-foreground line-clamp-2">
          {issue.title}
        </span>
      </div>

      {/* Footer: priority · impacted users · optional signal */}
      <div className="flex items-center gap-3">
        <PriorityBadge priority={issue.priority} />
        <span className="inline-flex items-center gap-1 text-body-sm text-tertiary-foreground">
          <Users size={13} strokeWidth={1.8} />
          {num(issue.impactedUsers)}
        </span>
        {investigating && <SignalChip issue={issue} />}
      </div>
    </button>
  );
}

function Column({ status, items }: { status: Status; items: Issue[] }) {
  const accent = STATUS_ACCENT[status];
  return (
    <section className="flex w-72 shrink-0 flex-col">
      <header className="flex items-center gap-2 px-1 pb-3">
        <span className="size-2.5 shrink-0 rounded-[4px]" style={{ background: `var(--${accent}-9)` }} />
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-secondary-foreground">
          {COLUMN_LABEL[status]}
        </span>
        <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{items.length}</span>
      </header>
      <div className="flex flex-col gap-2.5">
        {items.map((issue) => (
          <BoardCard key={issue.id} issue={issue} />
        ))}
      </div>
    </section>
  );
}

/** Kanban board: issues laid out in columns by workflow status. `issues` arrives
 *  already narrowed and ordered by the workspace header, the same set the list
 *  pane shows. */
export function Board({ issues }: { issues: Issue[] }) {
  const columns = useMemo(() => {
    const by: Record<Status, Issue[]> = {
      "Under Investigation": [],
      Active: [],
      "In Recovery": [],
      Resolved: [],
    };
    for (const i of issues) by[i.status].push(i);
    return STATUSES.map((status) => ({ status, items: by[status] }));
  }, [issues]);

  return (
    <div
      className="scrollbar-none flex min-w-0 flex-1 gap-5 overflow-x-auto p-5"
      style={{ background: "color-mix(in srgb, var(--color-primary-foreground) 3%, transparent)" }}
    >
      {columns.map((col) => (
        <Column key={col.status} status={col.status} items={col.items} />
      ))}
    </div>
  );
}
