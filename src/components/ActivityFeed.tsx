import type { ReactNode } from "react";
import { GitPullRequestArrow, LoaderCircle } from "lucide-react";
import { useStore } from "../store";
import type { ActivityEvent, ActivityKind } from "../data/types";
import { CodeDiff } from "./CodeDiff";
import { Avatar } from "./Avatar";

const DOT: Record<ActivityKind, string> = {
  problem: "var(--tomato-9)",
  status: "var(--blue-9)",
  finding: "var(--violet-9)",
  fact: "var(--amber-9)",
  assignment: "var(--grass-9)",
  priority: "var(--cyan-9)",
  comment: "var(--gray-9)",
  pr: "var(--violet-9)",
};

/** The rail node (avatar, glyph, or dot) for an event, sized to an 18px slot so
 *  the connecting line stays centred regardless of node type. */
function RailNode({ event, author }: { event: ActivityEvent; author?: { initials: string; accent: string } }) {
  const { memberById } = useStore();
  const member = event.memberId ? memberById(event.memberId) : undefined;

  if (member) return <Avatar member={member} size={18} />;
  if (author)
    return (
      <span
        className="flex size-[18px] items-center justify-center rounded-md text-[0.55rem] font-medium"
        style={{ background: `var(--${author.accent}-a3)`, color: `var(--${author.accent}-a11)` }}
      >
        {author.initials}
      </span>
    );
  if (event.kind === "status")
    return <LoaderCircle size={14} strokeWidth={2} style={{ color: DOT.status }} />;
  if (event.kind === "pr")
    return <GitPullRequestArrow size={14} strokeWidth={1.8} style={{ color: DOT.pr }} />;
  return <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: DOT[event.kind] }} />;
}

/** Small preview card for a linked resource (e.g. a pull request). */
function LinkCard({ link }: { link: NonNullable<ActivityEvent["link"]> }) {
  return (
    <button
      type="button"
      className="focusable mt-3 flex w-full items-center gap-3 rounded-lg border-border-default border-[0.5px] bg-component px-3 py-2.5 text-left transition-colors hover:border-border-strong"
    >
      <GitPullRequestArrow size={16} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-sm font-medium text-primary-foreground">{link.title}</span>
        <span className="truncate font-departure-mono text-[0.65rem] text-tertiary-foreground">{link.subtitle}</span>
      </span>
    </button>
  );
}

function EventRow({ event, last }: { event: ActivityEvent; last: boolean }) {
  const { memberById } = useStore();
  const member = event.memberId ? memberById(event.memberId) : undefined;
  const authorName = member?.name ?? event.author?.name;

  // Comments read "{name} commented"; system events use their own title.
  const heading: ReactNode =
    event.kind === "comment" ? (
      <>
        <span className="font-medium text-primary-foreground">{authorName}</span>
        <span className="text-secondary-foreground"> commented</span>
      </>
    ) : (
      <span className="font-medium text-primary-foreground">{event.title}</span>
    );

  return (
    <div className="flex gap-3">
      {/* Timeline rail */}
      <div className="flex w-[18px] flex-col items-center">
        <RailNode event={event} author={event.author} />
        {!last && <span className="mt-1 w-px flex-1" style={{ background: "var(--color-border-default)" }} />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex items-baseline gap-2 text-body-sm">
          <span className="font-sans">{heading}</span>
          <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">· {event.time}</span>
        </div>
        {event.body && <p className="mt-1 text-body-sm text-secondary-foreground">{event.body}</p>}
        {event.code && (
          <div className="mt-3">
            <CodeDiff file={event.code.file} lines={event.code.lines} />
          </div>
        )}
        {event.link && <LinkCard link={event.link} />}
      </div>
    </div>
  );
}

/** The activity timeline (the "Activity" tab). */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <p className="px-1 py-6 text-body-sm text-tertiary-foreground">No activity yet.</p>;
  }
  return (
    <div className="flex flex-col">
      {events.map((event, i) => (
        <EventRow key={event.id} event={event} last={i === events.length - 1} />
      ))}
    </div>
  );
}
