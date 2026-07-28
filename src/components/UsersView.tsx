import { useMemo, useState, type ReactNode } from "react";
import {
  Apple,
  ChevronDown,
  Eye,
  Fingerprint,
  Globe,
  KeyRound,
  LogOut,
  Monitor,
  MousePointerClick,
  Play,
  Smartphone,
  TriangleAlert,
  Users,
  Wifi,
} from "lucide-react";
import { useStore } from "../store";
import { endUsers, type Device, type EndUser, type SessionEvent, type UserSession } from "../data/users";
import type { Issue, Priority } from "../data/types";
import { PRIORITY_ACCENT } from "./Badges";
import { num } from "../lib/format";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { SegmentedControl } from "./SegmentedControl";
import { isNarrowed, matchesQuery, passesFilter, type WorkspaceState } from "../lib/workspace";

/* ----------------------------------------------------------------- selection */

/** End-users narrowed and ordered by the workspace header. Shared by the list
 *  pane and the grid, so both presentations show the same directory. */
function visibleUsers(state: WorkspaceState): EndUser[] {
  const rows = endUsers.filter(
    (u) =>
      matchesQuery(state.query, [u.name, u.email, u.country, u.source]) &&
      passesFilter(state, "country", u.country) &&
      passesFilter(state, "problems", u.activeProblemIds.length > 0 ? "with" : "without"),
  );

  const sorted = [...rows];
  switch (state.sort) {
    case "problems":
      sorted.sort((a, b) => b.activeProblemIds.length - a.activeProblemIds.length);
      break;
    case "sessions":
      sorted.sort((a, b) => b.sessionCount - a.sessionCount);
      break;
    // "name" is the default.
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

/* ------------------------------------------------------------------ profile */

function Avatar({ user, size }: { user: EndUser; size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center font-medium"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.36),
        background: `var(--${user.accent}-a3)`,
        color: `var(--${user.accent}-a11)`,
      }}
    >
      {user.initials}
    </div>
  );
}

/** Left column: the user directory (mirrors the inbox list). The search and
 *  filters that narrow it live in the shared workspace header. */
function UsersList({
  users,
  narrowed,
  selectedId,
  onSelect,
}: {
  users: EndUser[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {users.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No users match the current search or filters." : "No users."}
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {users.map((u) => {
            const active = u.id === selectedId;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelect(u.id)}
                aria-current={active ? "true" : undefined}
                className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
              >
                <Avatar user={u} size={30} />
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-body-sm text-primary-foreground">{u.name}</span>
                  <span className="truncate text-[0.72rem] text-tertiary-foreground">{u.email}</span>
                </div>
                {u.activeProblemIds.length > 0 && (
                  <span
                    className="shrink-0 rounded-full px-1.5 font-departure-mono text-[0.65rem]"
                    style={{ background: "var(--tomato-a3)", color: "var(--tomato-a11)" }}
                  >
                    {u.activeProblemIds.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Pane>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3">
      <span className="w-28 shrink-0 pt-0.5 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

function PriorityGlyph({ priority }: { priority: Priority }) {
  const accent = PRIORITY_ACCENT[priority];
  const lit = priority === "High" ? 3 : priority === "Medium" ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden style={{ height: 11 }}>
      {[5, 8, 11].map((h, i) => (
        <span key={h} className="w-[3px] rounded-[1px]" style={{ height: h, background: i < lit ? `var(--${accent}-9)` : `var(--${accent}-a4)` }} />
      ))}
    </span>
  );
}

/** Compact problem card used in the profile's "Active problems" list. */
function ProblemCard({ issue, onOpen }: { issue: Issue; onOpen: () => void }) {
  const { memberById } = useStore();
  const member = memberById(issue.assigneeId);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable focusable flex w-full flex-col gap-2 rounded-xl border-border-default border-[0.5px] bg-page p-3 text-left shadow-default transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-2">
        <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">#{issue.id}</span>
        {member && (
          <span
            className="ml-auto flex size-[18px] items-center justify-center rounded-md text-[0.55rem] font-medium"
            style={{ background: `var(--${member.accent}-a3)`, color: `var(--${member.accent}-a11)` }}
          >
            {member.initials}
          </span>
        )}
      </div>
      <div className="flex items-start gap-2">
        <KeyRound size={15} strokeWidth={1.8} className="mt-px shrink-0 text-tertiary-foreground" />
        <span className="min-w-0 flex-1 text-body-sm font-medium leading-5 text-primary-foreground">{issue.title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-body-sm text-secondary-foreground">
          <PriorityGlyph priority={issue.priority} />
          {issue.priority}
        </span>
        <span className="inline-flex items-center gap-1 text-body-sm text-tertiary-foreground">
          <Users size={13} strokeWidth={1.8} />
          {num(issue.impactedUsers)}
        </span>
      </div>
    </button>
  );
}

function Profile({ user }: { user: EndUser }) {
  const { issues, select, setView } = useStore();
  const active = user.activeProblemIds
    .map((id) => issues.find((i) => i.id === id))
    .filter((i): i is Issue => Boolean(i));

  const openIssue = (id: number) => {
    select(id);
    setView("inbox");
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-4">
        <Avatar user={user} size={72} />
        <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{user.name}</h2>
      </div>

      <div className="flex flex-col gap-1">
        <InfoRow label="Email address">
          <span className="truncate">{user.email}</span>
        </InfoRow>
        <InfoRow label="Country">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden>{user.countryFlag}</span>
            {user.country}
          </span>
        </InfoRow>
        <InfoRow label="Source">
          <span className="inline-flex items-center gap-2">
            <Fingerprint size={15} strokeWidth={1.8} className="text-tertiary-foreground" />
            {user.source}
          </span>
        </InfoRow>
        <InfoRow label="Surfaces">
          {user.surfaces.map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="text-tertiary-foreground">
                {/iOS|App/.test(s) ? <Smartphone size={15} strokeWidth={1.8} /> : <Globe size={15} strokeWidth={1.8} />}
              </span>
              {s}
            </span>
          ))}
        </InfoRow>
      </div>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="flex flex-col gap-1">
        <InfoRow label="First seen">
          <span>
            {user.firstSeen} <span className="text-tertiary-foreground">{user.firstSeenTime}</span>
          </span>
        </InfoRow>
        <InfoRow label="Last seen">
          <span>
            {user.lastSeen} <span className="text-tertiary-foreground">{user.lastSeenTime}</span>
          </span>
        </InfoRow>
        <InfoRow label="Session count">
          <span>{user.sessionCount}</span>
        </InfoRow>
        <InfoRow label="Problem count">
          <span>{user.activeProblemIds.length}</span>
        </InfoRow>
      </div>

      {active.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-body-base font-medium text-primary-foreground">Active problems</span>
            <span className="text-body-sm text-tertiary-foreground">
              {active.length} active out of {user.activeProblemIds.length} total problems
            </span>
          </div>
          {active.map((issue) => (
            <ProblemCard key={issue.id} issue={issue} onOpen={() => openIssue(issue.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sessions */

const EVENT_STYLE: Record<SessionEvent["kind"], { icon: ReactNode; color: string }> = {
  visit: { icon: <Eye size={13} strokeWidth={1.9} />, color: "var(--gray-9)" },
  leave: { icon: <LogOut size={13} strokeWidth={1.9} />, color: "var(--gray-9)" },
  error: { icon: <TriangleAlert size={13} strokeWidth={1.9} />, color: "var(--tomato-9)" },
  network: { icon: <Wifi size={13} strokeWidth={1.9} />, color: "var(--blue-9)" },
  click: { icon: <MousePointerClick size={13} strokeWidth={1.9} />, color: "var(--violet-9)" },
};

function DeviceIcons({ device }: { device: Device }) {
  const os = device.os === "apple" ? <Apple size={14} /> : device.os === "windows" ? <Monitor size={14} /> : <Smartphone size={14} />;
  return (
    <span className="flex shrink-0 items-center gap-2 text-tertiary-foreground">
      {os}
      <Globe size={14} strokeWidth={1.8} />
    </span>
  );
}

function EventRow({ event, onOpen }: { event: SessionEvent; onOpen: (id: number) => void }) {
  const style = EVENT_STYLE[event.kind];
  return (
    <div className="flex items-center gap-3 py-1.5 pl-7">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-component" style={{ color: style.color }}>
        {style.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-body-sm text-secondary-foreground">{event.label}</span>
      {event.problemId != null && (
        <button
          type="button"
          onClick={() => onOpen(event.problemId!)}
          className="focusable inline-flex items-center gap-1 rounded-md bg-component px-1.5 py-0.5 font-departure-mono text-[0.65rem] text-secondary-foreground transition-colors hover:text-primary-foreground"
        >
          <KeyRound size={11} strokeWidth={2} />#{event.problemId}
        </button>
      )}
      <span className="w-16 shrink-0 text-right font-departure-mono text-[0.65rem] text-tertiary-foreground">{event.time}</span>
    </div>
  );
}

function SessionRow({ session, onOpen }: { session: UserSession; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(true);
  const errors = session.events.filter((e) => e.kind === "error").length;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focusable flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-transparent-hover"
      >
        <Play
          size={12}
          strokeWidth={2}
          className="shrink-0 text-tertiary-foreground transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
        <span className="w-10 shrink-0 font-departure-mono text-[0.72rem] text-primary-foreground">{session.id}</span>
        <span className="shrink-0 text-body-sm text-tertiary-foreground">
          {session.events.length} events{" "}
          {errors > 0 && (
            <>
              · <span style={{ color: "var(--tomato-11)" }}>{errors} error</span>
            </>
          )}
        </span>
        <span className="ml-auto shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">
          {session.startedAt} · {session.duration}
        </span>
        <DeviceIcons device={session.device} />
      </button>

      {open && (
        <div className="flex flex-col pb-2">
          {session.events.map((ev) => (
            <EventRow key={ev.id} event={ev} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

const SESSION_TABS = ["Sessions", "Problems"] as const;
type SessionTab = (typeof SESSION_TABS)[number];

function Sessions({ user }: { user: EndUser }) {
  const { issues, select, setView } = useStore();
  const [tab, setTab] = useState<SessionTab>("Sessions");

  const openIssue = (id: number) => {
    select(id);
    setView("inbox");
  };

  // Group sessions by their date label, preserving order.
  const groups = useMemo(() => {
    const map = new Map<string, UserSession[]>();
    for (const s of user.sessions) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return [...map.entries()];
  }, [user]);

  const active = user.activeProblemIds
    .map((id) => issues.find((i) => i.id === id))
    .filter((i): i is Issue => Boolean(i));

  return (
    <DetailPane>
      {/* Tabs + tools */}
      <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
        <SegmentedControl
          variant="ghost"
          ariaLabel="User detail"
          segments={SESSION_TABS.map((t) => ({ id: t, label: t }))}
          value={tab}
          onChange={(id) => setTab(id as SessionTab)}
        />
      </div>

      {tab === "Sessions" ? (
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col px-2 py-2">
            {groups.map(([date, sessions]) => (
              <section key={date} className="mb-2">
                <header className="flex items-center gap-2 px-2 py-2">
                  <ChevronDown size={14} strokeWidth={2} className="text-tertiary-foreground" />
                  <span className="text-body-sm font-medium text-secondary-foreground">{date}</span>
                </header>
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} onOpen={openIssue} />
                ))}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="scrollbar-none flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-xl flex-col gap-3">
            {active.length === 0 ? (
              <p className="py-16 text-center text-body-sm text-tertiary-foreground">No active problems for this user.</p>
            ) : (
              active.map((issue) => <ProblemCard key={issue.id} issue={issue} onOpen={() => openIssue(issue.id)} />)
            )}
          </div>
        </div>
      )}
    </DetailPane>
  );
}

/* ------------------------------------------------------------------ grid mode */

/** A directory card for one end-user, used by the grid presentation. */
function UserCard({ user, onOpen }: { user: EndUser; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable focusable flex flex-col gap-3 rounded-xl border-border-default border-[0.5px] bg-page p-4 text-left shadow-default transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-3">
        <Avatar user={user} size={40} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-body-sm font-medium text-primary-foreground">{user.name}</span>
          <span className="truncate text-[0.72rem] text-tertiary-foreground">{user.email}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-border-default border-t-[0.5px] pt-3 text-body-sm text-tertiary-foreground">
        <span aria-hidden>{user.countryFlag}</span>
        <span className="truncate">{user.country}</span>
        {user.activeProblemIds.length > 0 && (
          <span
            className="ml-auto shrink-0 rounded-full px-1.5 font-departure-mono text-[0.65rem]"
            style={{ background: "var(--tomato-a3)", color: "var(--tomato-a11)" }}
          >
            {user.activeProblemIds.length} active
          </span>
        )}
      </div>
    </button>
  );
}

/** Grid presentation: a browseable card wall. Selecting a card returns to the
 *  list view focused on that user — mirroring the inbox board → detail flow. */
function UsersGrid({ users, narrowed, onOpen }: { users: EndUser[]; narrowed: boolean; onOpen: (id: string) => void }) {
  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto p-5">
        {users.length === 0 ? (
          <p className="py-16 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No users match the current search or filters." : "No users."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {users.map((u) => (
              <UserCard key={u.id} user={u} onOpen={() => onOpen(u.id)} />
            ))}
          </div>
        )}
      </div>
    </DetailPane>
  );
}

/* --------------------------------------------------------------------- view */

/** The opened user's detail: the session timeline (primary) and the profile in the
 *  collapsible context pane. Shared by list and grid modes. */
function UserDetail({ user }: { user: EndUser }) {
  return (
    <>
      <Sessions user={user} />
      <ContextPane>
        <Profile user={user} />
      </ContextPane>
    </>
  );
}

/** Users — end-user profiles with session history. List mode is the shared shell
 *  (list → sessions → collapsible profile). Grid mode is a browseable card wall;
 *  opening a user hides the wall and shows their detail (like the inbox board). */
export function UsersView() {
  const { viewMode, selectedUserId, selectUser, controls } = useStore();
  const state = controls("users");
  const users = visibleUsers(state);
  const narrowed = isNarrowed(state);
  const user = selectedUserId ? endUsers.find((u) => u.id === selectedUserId) ?? null : null;

  if (viewMode("users") === "grid") {
    return (
      <SplitView>
        {user ? <UserDetail user={user} /> : <UsersGrid users={users} narrowed={narrowed} onOpen={selectUser} />}
      </SplitView>
    );
  }

  return (
    <SplitView>
      <UsersList users={users} narrowed={narrowed} selectedId={selectedUserId} onSelect={selectUser} />
      {user ? <UserDetail user={user} /> : <EmptyDetail>Select a user.</EmptyDetail>}
    </SplitView>
  );
}
