import { useState } from "react";
import { ArrowUpRight, MessageSquare, ShieldCheck } from "lucide-react";
import {
  AWAITING_REVIEW,
  availableTransitions,
  explainRequirements,
  type ReviewAction,
  type WorkflowStatus,
} from "@conduit/domain";
import { useStore } from "../store";
import type { Workflow } from "../data/types";
import { WorkflowStatusChip } from "./Badges";
import { Button } from "./Button";
import { Avatar } from "./Avatar";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { isNarrowed, matchesQuery } from "../lib/workspace";

/* =============================================================================
   Review — the citizen lifecycle
   -----------------------------------------------------------------------------
   The third inversion, made a screen. The incumbent model has one tier, so the
   automation team *is* the queue: every request, however routine, waits on them.
   Splitting that into three only works if there's somewhere for submitted work to
   land and be judged — otherwise "citizen builders can build" just means
   unreviewed automation reaching production, which is worse than the queue.

   So this is deliberately built on the incident inbox's shape: a grouped list of
   things waiting on a person, opened one at a time, acted on and cleared. That
   engine already existed; what's new is the lifecycle behind it.

   Every action here comes from `availableTransitions(role, status)` — the same
   table the store checks before applying a move. A reviewer never sees a button
   the rules would refuse.
   ============================================================================= */

/** Submissions in the queue, grouped in the order a reviewer works them. */
const QUEUE_ORDER: WorkflowStatus[] = ["In review", "Approved", "Changes requested"];

const GROUP_BLURB: Partial<Record<WorkflowStatus, string>> = {
  "In review": "Waiting on you.",
  Approved: "Reviewed and cleared — publish when you're ready.",
  "Changes requested": "Back with the author.",
};

function Group({
  status,
  items,
  selectedId,
  onSelect,
}: {
  status: WorkflowStatus;
  items: Workflow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { memberById } = useStore();
  if (items.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-0.5">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <WorkflowStatusChip status={status} />
        <span className="text-[0.72rem] text-tertiary-foreground">{items.length}</span>
      </div>
      {/* Whose move it is, under the heading it belongs to. */}
      {GROUP_BLURB[status] && (
        <p className="px-2.5 pb-1.5 text-[0.7rem] text-tertiary-foreground">{GROUP_BLURB[status]}</p>
      )}
      {items.map((w) => {
        const active = w.id === selectedId;
        const author = memberById(w.submittedBy ?? w.ownerId);
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelect(w.id)}
            aria-current={active ? "true" : undefined}
            className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
            style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
          >
            {author && <Avatar member={author} size={20} />}
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-body-sm text-primary-foreground">{w.name}</span>
              <span className="truncate text-[0.72rem] text-tertiary-foreground">
                {author?.name ?? "—"} · {w.submittedAt ?? "not submitted"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- detail */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

/** What a reviewer needs to judge a submission, and the moves they can make on it. */
function Submission({ workflow }: { workflow: Workflow }) {
  const { role, memberById, reviewWorkflow, editWorkflow } = useStore();
  const [note, setNote] = useState("");
  const moves = availableTransitions(role, workflow.status);
  const author = memberById(workflow.submittedBy ?? workflow.ownerId);
  const reviewer = workflow.reviewedBy;

  const act = (action: ReviewAction) => {
    reviewWorkflow(workflow.id, action, note.trim() || undefined);
    setNote("");
  };

  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <WorkflowStatusChip status={workflow.status} />
              <span className="text-[0.72rem] text-tertiary-foreground">
                submitted by {author?.name ?? "—"} {workflow.submittedAt ?? ""}
              </span>
            </div>
            <h2 className="font-sans text-heading-3 font-medium text-primary-foreground">{workflow.name}</h2>
            <p className="text-body-base text-secondary-foreground">{workflow.description}</p>
          </header>

          {workflow.reviewNote && (
            <div className="flex flex-col gap-2 rounded-xl border-border-default border-[0.5px] bg-page p-4 shadow-default">
              <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-tertiary-foreground">
                <MessageSquare size={13} strokeWidth={1.8} />
                {reviewer ? `${reviewer} · ${workflow.reviewedAt ?? ""}` : "Review note"}
              </span>
              <p className="text-body-sm text-secondary-foreground">{workflow.reviewNote}</p>
            </div>
          )}

          <section className="flex flex-col gap-1">
            <Row label="Steps">{workflow.steps.length}</Row>
            <Row label="Packages">{workflow.packages.join(" · ") || "—"}</Row>
            <Row label="Needs">{explainRequirements(workflow.requirements)}</Row>
            <Row label="Trigger">
              {workflow.trigger.kind} · {workflow.trigger.detail}
            </Row>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-body-base font-medium text-primary-foreground">The flow</h3>
            <ol className="flex flex-col rounded-xl border-border-default border-[0.5px] bg-page px-4 shadow-default">
              {workflow.steps.map((step, i) => (
                <li
                  key={step.id}
                  className={
                    "flex items-center gap-3 py-2.5 border-border-default " +
                    (i < workflow.steps.length - 1 ? "border-b-[0.5px]" : "")
                  }
                >
                  <span className="w-5 shrink-0 font-departure-mono text-[0.7rem] text-tertiary-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{step.actionId}</span>
                </li>
              ))}
            </ol>
          </section>

          {moves.length > 0 && (
            <section className="flex flex-col gap-3 border-border-default border-t-[0.5px] pt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.72rem] text-tertiary-foreground">
                  Note to the author — carried with the decision
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="What needs to change, or why this is good to publish."
                  className="w-full rounded-lg bg-component px-2.5 py-2 text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {moves.map((t, i) => (
                  <Button
                    key={t.action}
                    variant={i === 0 ? "solid" : "outlined"}
                    onClick={() => act(t.action)}
                    className="w-fit"
                  >
                    {t.label}
                  </Button>
                ))}
                {workflow.platform === "conduit" && (
                  <Button variant="ghost" onClick={() => editWorkflow(workflow.id)} className="w-fit">
                    Open in builder
                    <ArrowUpRight size={14} strokeWidth={1.8} />
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </DetailPane>
  );
}

/** The submission's facts, in the shared context pane. */
function SubmissionContext({ workflow }: { workflow: Workflow }) {
  const { memberById } = useStore();
  const owner = memberById(workflow.ownerId);
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-4">
        <div
          className="flex size-12 items-center justify-center rounded-xl"
          style={{ background: "var(--blue-a3)", color: "var(--blue-a11)" }}
        >
          <ShieldCheck size={22} strokeWidth={1.7} />
        </div>
        <WorkflowStatusChip status={workflow.status} />
      </div>
      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />
      <div className="flex flex-col gap-1">
        <Row label="Owner">
          <span className="inline-flex items-center gap-1.5">
            {owner && <Avatar member={owner} size={18} />}
            {owner?.name}
          </span>
        </Row>
        <Row label="Submitted">{workflow.submittedAt ?? "—"}</Row>
        <Row label="Last reviewed">{workflow.reviewedAt ?? "—"}</Row>
        <Row label="Reviewer">{workflow.reviewedBy ?? "—"}</Row>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- view */

/** Review — submissions waiting on a professional, and the moves they can make. */
export function ReviewView() {
  const { workflows, controls, selectedWorkflowId, selectWorkflow, allowed } = useStore();
  const state = controls("review");

  // Anything mid-lifecycle belongs here; Draft doesn't, because nobody has handed
  // it over yet, and Published/Paused are past the queue.
  const inQueue = workflows.filter(
    (w) =>
      (AWAITING_REVIEW.includes(w.status) || w.status === "Changes requested") &&
      matchesQuery(state.query, [w.name, w.description, w.submittedBy, w.reviewedBy]),
  );
  const selected = inQueue.find((w) => w.id === selectedWorkflowId) ?? null;

  if (!allowed("review")) {
    return (
      <SplitView>
        <EmptyDetail>Reviewing submissions is a professional's job. Switch tier in Settings to see the queue.</EmptyDetail>
      </SplitView>
    );
  }

  return (
    <SplitView>
      <Pane width={PANE_WIDTH.list}>
        <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
          {inQueue.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
              {isNarrowed(state) ? "Nothing matches the current search." : "Nothing waiting. The queue is clear."}
            </p>
          ) : (
            QUEUE_ORDER.map((status) => (
              <Group
                key={status}
                status={status}
                items={inQueue.filter((w) => w.status === status)}
                selectedId={selectedWorkflowId}
                onSelect={selectWorkflow}
              />
            ))
          )}
        </div>
      </Pane>
      {selected ? (
        <>
          <Submission workflow={selected} />
          <ContextPane>
            <SubmissionContext workflow={selected} />
          </ContextPane>
        </>
      ) : (
        <EmptyDetail>Select a submission to review.</EmptyDetail>
      )}
    </SplitView>
  );
}
