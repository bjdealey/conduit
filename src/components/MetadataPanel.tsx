import type { ReactNode } from "react";
import { ChevronRight, Globe, KeyRound, Layout, Mail, RefreshCw, Server, Smartphone, Search, CreditCard, BarChart3, LoaderCircle } from "lucide-react";
import { useStore } from "../store";
import { STATUSES, type Issue, type Priority, type Status } from "../data/types";
import { Avatar } from "./Avatar";
import { PRIORITY_ACCENT, STATUS_ACCENT } from "./Badges";

const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

/** Short status labels for the metadata glyph row (matches the activity voice). */
const STATUS_LABEL: Record<Status, string> = {
  "Under Investigation": "Investigating…",
  Active: "Active",
  "In Recovery": "In Recovery",
  Resolved: "Resolved",
};

const surfaceProps = { size: 15, strokeWidth: 1.8 };
const SURFACE_ICON: Record<string, ReactNode> = {
  Website: <Globe {...surfaceProps} />,
  Frontend: <Layout {...surfaceProps} />,
  "iOS App": <Smartphone {...surfaceProps} />,
  Backend: <Server {...surfaceProps} />,
  Email: <Mail {...surfaceProps} />,
  Auth: <KeyRound {...surfaceProps} />,
  Payments: <CreditCard {...surfaceProps} />,
  Billing: <CreditCard {...surfaceProps} />,
  Search: <Search {...surfaceProps} />,
  Analytics: <BarChart3 {...surfaceProps} />,
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-32 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Overlay a native <select> on top of arbitrary display content so the field
 *  looks like the mockup but is fully editable. */
function EditableField({
  value,
  options,
  onChange,
  children,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center rounded-md px-1.5 -mx-1.5 transition-colors hover:bg-transparent-hover">
      {children}
      <select
        aria-label="Edit field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Ascending 3-bar priority glyph, lit to the priority level in its accent. */
function PriorityGlyph({ priority }: { priority: Priority }) {
  const accent = PRIORITY_ACCENT[priority];
  const lit = priority === "High" ? 3 : priority === "Medium" ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden style={{ height: 12 }}>
      {[5, 8, 11].map((h, i) => (
        <span
          key={h}
          className="w-[3px] rounded-[1px]"
          style={{ height: h, background: i < lit ? `var(--${accent}-9)` : `var(--${accent}-a4)` }}
        />
      ))}
    </span>
  );
}

/** Right-hand metadata panel. Priority, Assignee and Status are editable; the
 *  rest are read-only facts. `onEvidence` opens the Evidence tab. */
export function MetadataPanel({ issue, onEvidence }: { issue: Issue; onEvidence?: () => void }) {
  const { members, memberById, updateIssue } = useStore();
  const assignee = memberById(issue.assigneeId);
  const statusAccent = STATUS_ACCENT[issue.status];

  return (
    <div className="flex flex-col gap-1">
      <Row label="Title">
        <span className="truncate text-body-sm text-primary-foreground">{issue.title}</span>
      </Row>
      <Row label="ID">
        <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">#{issue.id}</span>
      </Row>

      <Row label="Priority">
        <EditableField
          value={issue.priority}
          options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          onChange={(v) => updateIssue(issue.id, { priority: v as Priority })}
        >
          <span className="inline-flex items-center gap-2">
            <PriorityGlyph priority={issue.priority} />
            <span className="text-body-sm text-primary-foreground">{issue.priority}</span>
          </span>
        </EditableField>
      </Row>

      <Row label="Assignee">
        <EditableField
          value={issue.assigneeId}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(v) => updateIssue(issue.id, { assigneeId: v })}
        >
          <span className="inline-flex items-center gap-1.5">
            {assignee && <Avatar member={assignee} size={18} />}
            <span className="text-body-sm text-primary-foreground">{assignee?.name}</span>
          </span>
        </EditableField>
      </Row>

      <Row label="Status">
        <EditableField
          value={issue.status}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          onChange={(v) => updateIssue(issue.id, { status: v as Status })}
        >
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle size={14} strokeWidth={2} style={{ color: `var(--${statusAccent}-9)` }} />
            <span className="text-body-sm text-primary-foreground">{STATUS_LABEL[issue.status]}</span>
          </span>
        </EditableField>
      </Row>

      <Row label="Surface">
        <div className="flex min-w-0 flex-col gap-1">
          {issue.surface.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-body-sm text-primary-foreground">
              <span className="shrink-0 text-tertiary-foreground">{SURFACE_ICON[s] ?? <Server {...surfaceProps} />}</span>
              {s}
            </span>
          ))}
        </div>
      </Row>

      <div className="my-3 h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <Row label="Regression">
        <span className="inline-flex items-center gap-1.5 text-body-sm text-primary-foreground">
          {issue.regression && (
            <RefreshCw size={13} strokeWidth={1.8} style={{ color: "var(--amber-11)" }} />
          )}
          {issue.regression ? "Yes" : "No"}
        </span>
      </Row>
      <Row label="First detection">
        <span className="text-body-sm text-primary-foreground">{issue.firstDetection}</span>
      </Row>
      <Row label="Latest detection">
        <span className="text-body-sm text-primary-foreground">{issue.latestDetection}</span>
      </Row>
      <Row label="Duration">
        <span className="text-body-sm text-primary-foreground">{issue.duration}</span>
      </Row>
      <Row label="Evidence">
        <button
          type="button"
          onClick={onEvidence}
          className="focusable group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-body-sm text-primary-foreground transition-colors hover:bg-transparent-hover"
        >
          {issue.findingsCount} evidence
          <ChevronRight size={14} strokeWidth={1.8} className="text-tertiary-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      </Row>
    </div>
  );
}
