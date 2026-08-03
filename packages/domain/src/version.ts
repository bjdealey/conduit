/**
 * Workflow versions and schema versions — two different things that both need a
 * number, and are routinely confused.
 *
 * - **Workflow version** is editorial: v1, v2, v3 of *this* flow. It is what a review
 *   approves and what a publish publishes. Without it, "approved" attaches to a
 *   moving target — the author edits after approval and the approval silently covers
 *   something nobody read.
 * - **Schema version** is structural: which shape the stored flow is written in. It
 *   exists so growth in workflow capability doesn't break older workflows, which the
 *   vision names as a requirement rather than a nicety.
 *
 * The schema is versioned *before* it grows a branch, because the first genuinely
 * useful API workflow needs a conditional and a bare step array cannot express one.
 * Migrating a v1 flow after that lands is cheap; migrating it retroactively is not.
 */

/**
 * The current workflow schema version.
 *
 * Bump this when the stored shape changes, and add a migration step for the gap.
 * v1 is the flat, linear `steps` array the builder writes today.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/** A snapshot of a workflow at a point in its editorial history. */
export type WorkflowVersion = {
  /** Monotonic within one workflow, starting at 1. */
  version: number;
  /** Who cut this version, and when. */
  authoredBy: string;
  authoredAt: string;
  /** One line on what changed, shown in the history list. */
  summary: string;
  /** The schema this snapshot was written in. */
  schemaVersion: number;
  /** Set once this version has been approved, naming the reviewer. */
  approvedBy?: string;
  approvedAt?: string;
  /** Set once this version has run in production. */
  publishedAt?: string;
};

/** The next version number for a history. Versions never renumber or reuse. */
export function nextVersion(history: readonly WorkflowVersion[]): number {
  return history.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

/** The version currently published, if any. */
export function publishedVersion(history: readonly WorkflowVersion[]): WorkflowVersion | undefined {
  return [...history].reverse().find((v) => v.publishedAt !== undefined);
}

/** The newest version, published or not — what the builder opens. */
export function latestVersion(history: readonly WorkflowVersion[]): WorkflowVersion | undefined {
  return history.reduce<WorkflowVersion | undefined>((latest, v) => (!latest || v.version > latest.version ? v : latest), undefined);
}

/**
 * Whether the published version is behind the latest — i.e. someone has edited since
 * the last publish. The library shows this, because "approved" on a workflow whose
 * author has moved on is the exact failure the version number exists to prevent.
 */
export function hasUnpublishedChanges(history: readonly WorkflowVersion[]): boolean {
  const published = publishedVersion(history);
  const latest = latestVersion(history);
  if (!latest) return false;
  return !published || published.version < latest.version;
}

/* ------------------------------------------------------------------ migration */

/** A stored workflow of unknown vintage, as it comes back from the API or storage. */
export type StoredWorkflow = Record<string, unknown> & { schemaVersion?: number };

/** One step in the migration chain: from a version to the next. */
type MigrationStep = { from: number; to: number; apply: (raw: StoredWorkflow) => StoredWorkflow };

/**
 * The migration chain, in order.
 *
 * Empty at v1 because there is nothing older to migrate yet. It exists now so that
 * adding v2 is one entry rather than a retrofit — and so the guarantee is testable
 * before it is needed.
 */
const MIGRATIONS: readonly MigrationStep[] = Object.freeze([]);

/**
 * Bring a stored workflow up to the current schema.
 *
 * A workflow with no `schemaVersion` predates versioning and is treated as v1, which
 * is the only safe reading: v1 is the shape that existed before the field did.
 * A workflow from the *future* is returned untouched rather than mangled — a newer
 * client wrote it, and silently downgrading it would lose whatever it added.
 */
export function migrateWorkflow(raw: StoredWorkflow): StoredWorkflow {
  let current = raw.schemaVersion ?? 1;
  if (current >= CURRENT_SCHEMA_VERSION) return { ...raw, schemaVersion: current };

  let out = { ...raw };
  for (const step of MIGRATIONS) {
    if (step.from !== current) continue;
    out = step.apply(out);
    current = step.to;
  }
  return { ...out, schemaVersion: current };
}

/** Whether a stored workflow needs migrating before it can be read. */
export function needsMigration(raw: StoredWorkflow): boolean {
  return (raw.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION;
}
