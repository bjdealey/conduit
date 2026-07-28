/** Domain model for the Conduit platform prototype. */

/** Priorities, in the order they rank (highest first). */
export const PRIORITIES = ["High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Workflow states, in the order the inbox groups them. */
export const STATUSES = ["Under Investigation", "Active", "In Recovery", "Resolved"] as const;
export type Status = (typeof STATUSES)[number];

export type Member = {
  id: string;
  /** Two-letter avatar initials, e.g. "LS". */
  initials: string;
  name: string;
  /** Radix accent scale prefix used for the avatar colour, e.g. "cyan". */
  accent: string;
};

export type ActivityKind =
  | "problem"
  | "status"
  | "finding"
  | "fact"
  | "assignment"
  | "priority"
  | "comment"
  | "pr";

export type CodeDiffLine = {
  n: number;
  text: string;
  /** "add" | "del" for diff gutter colouring, undefined for context lines. */
  change?: "add" | "del";
};

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  /** Relative time label as shown in the mockup, e.g. "4 min ago". */
  time: string;
  title: string;
  body?: string;
  /** Optional inline code diff (findings). */
  code?: { file: string; lines: CodeDiffLine[] };
  /** Optional member reference (assignment / comment author). */
  memberId?: string;
  /** Optional non-member author (e.g. a comment posted from the composer). */
  author?: { name: string; initials: string; accent: string };
  /** Optional linked-resource preview card (e.g. a pull request). */
  link?: { title: string; subtitle: string };
};

export type Issue = {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: string;
  surface: string[];
  regression: boolean;
  firstDetection: string;
  latestDetection: string;
  duration: string;
  findingsCount: number;
  impactedUsers: number;
  activity: ActivityEvent[];
  /** The automation this incident concerns, if any. Optional: an issue may be
   *  raised manually against an automation, spun off a failed run, or stand alone. */
  automationId?: string;
  /** The specific run whose failure spawned this incident, when applicable. */
  sourceRunId?: string;
};

/* -------------------------------------------------------------------- automation */

/** Fixed platform roles. Gates the UI (admin edits permissions; developer and
 *  user get progressively scoped views). */
export type Role = "admin" | "developer" | "user";

/** Whether an automation / folder is shared (Public) or owner-scoped (Private). */
export type Visibility = "public" | "private";

/** A node in the automation library tree. `parentId: null` sits at a visibility
 *  root (Public / Private). */
export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  visibility: Visibility;
};

/** Automation run states, in the order the Activity view groups them. */
export const RUN_STATES = ["Queued", "Running", "Completed", "Failed"] as const;
export type RunState = (typeof RUN_STATES)[number];

/** How a run was started. */
export const RUN_TRIGGERS = ["Manual", "Schedule", "Event"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

/** A single execution of an automation. Its `activity` reuses the incident
 *  timeline shape as the run log; a failed run may have spawned an incident. */
export type Run = {
  id: string;
  automationId: string;
  state: RunState;
  trigger: RunTrigger;
  /** Who/what started it — a member name or the trigger source. */
  startedBy: string;
  startedAt: string;
  duration: string;
  /** Execution target (device/environment label), when applicable. */
  target?: string;
  /** Append-only run log, rendered with the shared <ActivityFeed>. */
  activity: ActivityEvent[];
  /** The incident this run spawned on failure, if any. */
  issueId?: number;
};

/** The automation lifecycle, distinct from an incident's workflow status. */
export type AutomationStatus = "Active" | "Paused" | "Draft";

/** How an automation starts. `detail` carries the cadence for a schedule
 *  ("Every 15 minutes"), the event key for an event ("user.signup"), or who may
 *  run it by hand — the same vocabulary a Run's `startedBy` reads in. */
export type AutomationTrigger = { kind: RunTrigger; detail: string };

/** One step in an automation's flow: an action from the palette
 *  (`src/data/actions.ts`) plus the values filled in for that action's fields.
 *  `config` is keyed by field id; a missing key means the field is unset. */
export type AutomationStep = {
  id: string;
  /** Action id from the palette — resolves to its label, package, and fields. */
  actionId: string;
  config: Record<string, string>;
};

/** A first-class automation definition. Lives in a Folder; produces Runs;
 *  its failures can spin off Issues. */
export type Automation = {
  id: string;
  name: string;
  description: string;
  folderId: string;
  visibility: Visibility;
  status: AutomationStatus;
  /** Owning team member id (see `members`). */
  ownerId: string;
  /** What starts it. Edited in the builder; mirrored by the runs it produces. */
  trigger: AutomationTrigger;
  /** The flow itself, in execution order. Authored in the builder; the
   *  `packages` list is derived from these steps' actions on save. */
  steps: AutomationStep[];
  /** Rollup stats shown in the library table and detail header. */
  runCount: number;
  /** Success rate across recent runs, 0..1. */
  successRate: number;
  lastRunAt: string;
  updatedAgo: string;
  /** Packages this automation depends on (Dependencies tab). */
  packages: string[];
  /** Other automation ids this one references (Dependencies tab). */
  references: string[];
};

/** The automation open in the builder: one loaded from the library for editing,
 *  or a new one that isn't in it yet (`isNew`, committed on save). */
export type AutomationDraft = Automation & { isNew: boolean };
