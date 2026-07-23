import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { ActivityEvent, Issue } from "../data/types";
import { currentUser } from "../data/user";
import { num } from "../lib/format";
import { MetadataPanel } from "./MetadataPanel";
import { ActivityFeed } from "./ActivityFeed";
import { ImpactChart } from "./ImpactChart";
import { DetailPane, ContextPane } from "./layout/SplitView";

const TABS = ["Activity", "Sessions", "Evidence"] as const;
type Tab = (typeof TABS)[number];

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="text-body-base font-medium text-secondary-foreground">{label}</span>
      <span className="text-body-sm text-tertiary-foreground">Nothing to show in this prototype tab yet.</span>
    </div>
  );
}

/** Bottom-anchored comment composer for the Activity tab. */
function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };
  return (
    <div className="shrink-0 border-border-default border-t-[0.5px] px-6 py-4">
      <div className="flex flex-col gap-2 rounded-xl border-border-default border-[0.5px] bg-page px-3 py-2.5 transition-colors focus-within:border-border-strong">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Leave a comment…"
          className="w-full bg-transparent text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="pressable focusable rounded-lg px-3 py-1 text-body-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--color-brand-solid)", color: "#fff" }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export function IssueDetail({ issue }: { issue: Issue }) {
  const [tab, setTab] = useState<Tab>("Activity");
  // Comments posted from the composer, kept per issue for the session.
  const [posted, setPosted] = useState<Record<number, ActivityEvent[]>>({});

  const addComment = (text: string) =>
    setPosted((prev) => {
      const next = prev[issue.id] ?? [];
      const event: ActivityEvent = {
        id: `posted-${issue.id}-${next.length}`,
        kind: "comment",
        time: "just now",
        title: "commented",
        author: { name: currentUser.name, initials: currentUser.initials, accent: "gray" },
        body: text,
      };
      return { ...prev, [issue.id]: [...next, event] };
    });

  const events = [...issue.activity, ...(posted[issue.id] ?? [])];

  return (
    <>
      {/* Activity — the primary detail pane */}
      <DetailPane>
        <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="focusable rounded-md px-2.5 py-1 text-body-sm transition-colors"
              style={{
                background: tab === t ? "var(--color-transparent-hover)" : "transparent",
                color: tab === t ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t}
              {t === "Evidence" && (
                <span className="ml-1.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">
                  {issue.findingsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "Activity" ? (
          <>
            <div className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex flex-1 flex-col overflow-y-auto px-6 py-6">
              <ActivityFeed events={events} />
            </div>
            <Composer onSend={addComment} />
          </>
        ) : (
          <div
            key={tab}
            className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex flex-1 flex-col overflow-y-auto px-6 py-6"
          >
            {tab === "Sessions" && <EmptyState label="Session replays" />}
            {tab === "Evidence" && <EmptyState label={`${issue.findingsCount} evidence`} />}
          </div>
        )}
      </DetailPane>

      {/* Summary + metadata — the collapsible context pane */}
      <ContextPane>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4">
            <div
              className="flex size-12 items-center justify-center rounded-xl"
              style={{ background: "var(--cyan-a3)", color: "var(--cyan-a11)" }}
            >
              <KeyRound size={22} strokeWidth={1.7} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">#{issue.id}</span>
              <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{issue.title}</h2>
              <p className="text-body-base text-secondary-foreground">{issue.description}</p>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <MetadataPanel issue={issue} onEvidence={() => setTab("Evidence")} />

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          {/* Impacted users trend */}
          <div className="flex flex-col gap-2">
            <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
              Impacted Users
            </span>
            <span className="font-sans text-heading-4 font-medium text-primary-foreground">
              {num(issue.impactedUsers)}
            </span>
            <ImpactChart seed={issue.id} />
          </div>
        </div>
      </ContextPane>
    </>
  );
}
