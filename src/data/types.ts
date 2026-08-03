/** Domain model for the Conduit platform prototype. */

import type { Role, WorkflowRequirements, WorkflowStatus } from "@conduit/domain";

export type { Role, WorkflowStatus };

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
  /** The workflow this incident concerns, if any. Optional: an issue may be
   *  raised manually against an workflow, spun off a failed run, or stand alone. */
  workflowId?: string;
  /** The specific run whose failure spawned this incident, when applicable. */
  sourceRunId?: string;
};

/* -------------------------------------------------------------------- workflow */

/* Roles and the workflow lifecycle live in `packages/domain/src/review.ts`, with the
   permission table and the transition rules they gate. Keeping the vocabulary next to
   the rules is what stops the UI offering a button the rules would refuse. */

/** Whether an workflow / folder is shared (Public) or owner-scoped (Private). */
export type Visibility = "public" | "private";

/** A node in the workflow library tree. `parentId: null` sits at a visibility
 *  root (Public / Private). */
export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  visibility: Visibility;
};

/** Workflow run states, in the order the Activity view groups them. */
export const RUN_STATES = ["Queued", "Running", "Completed", "Failed"] as const;
export type RunState = (typeof RUN_STATES)[number];

/** How a run was started. */
export const RUN_TRIGGERS = ["Manual", "Schedule", "Event"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

/** A single execution of an workflow. Its `activity` reuses the incident
 *  timeline shape as the run log; a failed run may have spawned an incident. */
export type Run = {
  id: string;
  workflowId: string;
  state: RunState;
  trigger: RunTrigger;
  /** Who/what started it — a member name or the trigger source. */
  startedBy: string;
  startedAt: string;
  duration: string;
  /** The runner this run was placed on (see `src/data/runners.ts`). Absent while a
   *  run is queued — nothing has been placed yet. */
  runnerId?: string;
  /** Append-only run log, rendered with the shared <ActivityFeed>. */
  activity: ActivityEvent[];
  /** The incident this run spawned on failure, if any. */
  issueId?: number;
};



/** The platform that executes an workflow today. `conduit` is native — authored
 *  here, run on our runners. Anything else is a connected platform mirrored into the
 *  library by its connector: we show it and observe it, but its flow lives over there. */
export const WORKFLOW_PLATFORMS = ["conduit", "automation-anywhere"] as const;
export type WorkflowPlatform = (typeof WORKFLOW_PLATFORMS)[number];

/** Display names for the platforms an workflow can run on. */
export const PLATFORM_LABEL: Record<WorkflowPlatform, string> = {
  conduit: "Conduit",
  "automation-anywhere": "Automation Anywhere",
};

/** How far along the move onto Conduit an workflow is. Per workflow and
 *  reversible: there is no cutover date, so this is a state rather than a milestone,
 *  and "Won't move" is a legitimate resting place rather than a failure. */
export const MIGRATION_STATES = ["Not started", "Piloting", "Migrated", "Won't move"] as const;
export type MigrationState = (typeof MIGRATION_STATES)[number];

/** How an workflow starts. `detail` carries the cadence for a schedule
 *  ("Every 15 minutes"), the event key for an event ("user.signup"), or who may
 *  run it by hand — the same vocabulary a Run's `startedBy` reads in. */
export type WorkflowTrigger = { kind: RunTrigger; detail: string };

/** One step in an workflow's flow: an action from the palette
 *  (`src/data/actions.ts`) plus the values filled in for that action's fields.
 *  `config` is keyed by field id; a missing key means the field is unset. */
export type WorkflowStep = {
  id: string;
  /** Action id from the palette — resolves to its label, package, and fields. */
  actionId: string;
  config: Record<string, string>;
};

/** A first-class workflow definition. Lives in a Folder; produces Runs;
 *  its failures can spin off Issues. */
export type Workflow = {
  id: string;
  name: string;
  description: string;
  folderId: string;
  visibility: Visibility;
  status: WorkflowStatus;
  /** Owning team member id (see `members`). */
  ownerId: string;
  /** Which platform runs it today. Mirrored workflows (`platform !== "conduit"`)
   *  have no `steps` — their flow is authored on their own platform. */
  platform: WorkflowPlatform;
  /** Where it sits in the move onto Conduit. */
  migration: MigrationState;
  /** What it needs from a runner — the only thing the distributor routes on.
   *  Declared here and raised on save to at least what its steps require, so a flow
   *  can't quietly need more than it admits to. */
  requirements: WorkflowRequirements;
  /** Who submitted it for review, and when. Absent until it is first submitted. */
  submittedBy?: string;
  submittedAt?: string;
  /** Who last reviewed it, when, and what they said. A published workflow always
   *  carries an approval — there is no transition that skips one. */
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** What starts it. Edited in the builder; mirrored by the runs it produces. */
  trigger: WorkflowTrigger;
  /** The flow itself, in execution order. Authored in the builder; the
   *  `packages` list is derived from these steps' actions on save. */
  steps: WorkflowStep[];
  /** Rollup stats shown in the library table and detail header. */
  runCount: number;
  /** Success rate across recent runs, 0..1. */
  successRate: number;
  lastRunAt: string;
  updatedAgo: string;
  /** Packages this workflow depends on (Dependencies tab). */
  packages: string[];
  /** Other workflow ids this one references (Dependencies tab). */
  references: string[];
};

/** The workflow open in the builder: one loaded from the library for editing,
 *  or a new one that isn't in it yet (`isNew`, committed on save). */
export type WorkflowDraft = Workflow & { isNew: boolean };
