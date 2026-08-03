/**
 * Tiers and the review lifecycle — the third inversion.
 *
 * The incumbent model has one tier: everything flows through the automation team, so
 * the team is the queue. The vision splits that into three, and the split is only
 * safe *because* the runtime is stateless and placement is automatic — with
 * hand-configured machines and manual distribution, letting business users trigger
 * and build would be ops chaos.
 *
 * Two rules live here, together, because they are the same rule seen twice: what a
 * tier may do, and which lifecycle moves that permits. Keeping them apart is how a UI
 * ends up offering a button the backend will refuse.
 */

/**
 * Who someone is on the platform.
 *
 * - `consumer` — triggers workflows they're permitted to run and reads the output.
 *   They don't build, and they aren't stuck behind the automation team's queue for
 *   routine work.
 * - `builder` — the citizen builder. Authors their own workflows and submits them;
 *   what they build is reviewed before it can run in production.
 * - `professional` — the automation team. Builds the hard workflows, reviews
 *   submissions, owns what runs in production, and may publish without review.
 * - `admin` — everything a professional can do, plus governance of the platform.
 */
export const ROLES = ["consumer", "builder", "professional", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Display names for the tiers. */
export const ROLE_LABEL: Readonly<Record<Role, string>> = Object.freeze({
  consumer: "Consumer",
  builder: "Citizen builder",
  professional: "Professional",
  admin: "Admin",
});

/** One line on what each tier is for, shown wherever a role is chosen. */
export const ROLE_BLURB: Readonly<Record<Role, string>> = Object.freeze({
  consumer: "Runs the workflows they're permitted to run, and reads the results.",
  builder: "Builds their own workflows and submits them for review.",
  professional: "Builds, reviews submissions, and owns what runs in production.",
  admin: "Everything a professional can do, plus platform governance.",
});

/**
 * What a tier is allowed to do. Deliberately verbs, not screens — a permission that
 * names a screen stops being checkable the moment the screen moves.
 */
export const PERMISSIONS = ["trigger", "author", "submit", "review", "publish", "administer"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * The tier table. A consumer triggers and nothing else; a builder adds authoring and
 * submission but cannot approve their own work; a professional adds review and
 * publish. The gap between `submit` and `publish` is the whole review lifecycle.
 */
const GRANTS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  consumer: ["trigger"],
  builder: ["trigger", "author", "submit"],
  professional: ["trigger", "author", "submit", "review", "publish"],
  admin: ["trigger", "author", "submit", "review", "publish", "administer"],
});

/** Whether a tier holds a permission. */
export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/** Every permission a tier holds, for rendering the tier table. */
export function permissionsOf(role: Role): readonly Permission[] {
  return GRANTS[role];
}

/* ------------------------------------------------------------------ lifecycle */

/**
 * Where a workflow sits between being written and running in production.
 *
 * `Changes requested` is a first-class state rather than a rejection: citizen work
 * coming back for another pass is the normal case the model is built around, not a
 * failure of it.
 */
export const WORKFLOW_STATUSES = [
  "Draft",
  "In review",
  "Changes requested",
  "Approved",
  "Published",
  "Paused",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** A lifecycle move, named as the action someone takes rather than the state it lands in. */
export const REVIEW_ACTIONS = ["submit", "approve", "request-changes", "publish", "pause", "resume", "withdraw"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** One available move: what it's called, where it lands, and what it needs. */
export type Transition = {
  action: ReviewAction;
  to: WorkflowStatus;
  /** The permission required to make this move. */
  needs: Permission;
  /** Button label. */
  label: string;
};

/**
 * The lifecycle, as a table of moves out of each state.
 *
 * `Draft → Published` is deliberately absent even for a professional: publishing goes
 * through Approved, so every published workflow has an approval recorded against it
 * regardless of who wrote it. A professional can walk their own work through in two
 * clicks; nobody skips the trail.
 */
const TRANSITIONS: Readonly<Record<WorkflowStatus, readonly Transition[]>> = Object.freeze({
  Draft: [{ action: "submit", to: "In review", needs: "submit", label: "Submit for review" }],
  "In review": [
    { action: "approve", to: "Approved", needs: "review", label: "Approve" },
    { action: "request-changes", to: "Changes requested", needs: "review", label: "Request changes" },
    { action: "withdraw", to: "Draft", needs: "submit", label: "Withdraw" },
  ],
  "Changes requested": [{ action: "submit", to: "In review", needs: "submit", label: "Resubmit" }],
  Approved: [
    { action: "publish", to: "Published", needs: "publish", label: "Publish" },
    { action: "request-changes", to: "Changes requested", needs: "review", label: "Request changes" },
  ],
  Published: [{ action: "pause", to: "Paused", needs: "publish", label: "Pause" }],
  Paused: [{ action: "resume", to: "Published", needs: "publish", label: "Resume" }],
});

/** Every move out of a status, regardless of who is asking. */
export function transitionsFrom(status: WorkflowStatus): readonly Transition[] {
  return TRANSITIONS[status];
}

/** The moves a given tier may actually make from here — what the UI should offer. */
export function availableTransitions(role: Role, status: WorkflowStatus): Transition[] {
  return TRANSITIONS[status].filter((t) => can(role, t.needs));
}

/** Whether a specific move is allowed. The check a mutation runs before applying. */
export function canTransition(role: Role, from: WorkflowStatus, action: ReviewAction): boolean {
  return availableTransitions(role, from).some((t) => t.action === action);
}

/** Statuses that are waiting on a reviewer — the review queue's contents. */
export const AWAITING_REVIEW: readonly WorkflowStatus[] = Object.freeze(["In review", "Approved"]);

/** Whether a workflow is live enough to be triggered. */
export function isRunnable(status: WorkflowStatus): boolean {
  return status === "Published";
}
