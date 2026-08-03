import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  hasUnpublishedChanges,
  latestVersion,
  migrateWorkflow,
  needsMigration,
  nextVersion,
  publishedVersion,
  type WorkflowVersion,
} from "../version.ts";

const v = (version: number, patch: Partial<WorkflowVersion> = {}): WorkflowVersion => ({
  version,
  authoredBy: "ps",
  authoredAt: "yesterday",
  summary: `v${version}`,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  ...patch,
});

describe("version numbering", () => {
  it("starts at 1 and never reuses a number", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([v(1), v(2)])).toBe(3);
    // A gap in history (a version pruned, say) must not hand back a used number.
    expect(nextVersion([v(1), v(5)])).toBe(6);
  });

  it("finds the latest version regardless of array order", () => {
    expect(latestVersion([v(3), v(1), v(2)])?.version).toBe(3);
    expect(latestVersion([])).toBeUndefined();
  });
});

describe("what is actually published", () => {
  it("reports the published version, not merely the newest", () => {
    const history = [v(1, { publishedAt: "a week ago" }), v(2)];
    expect(publishedVersion(history)?.version).toBe(1);
    expect(latestVersion(history)?.version).toBe(2);
  });

  it("flags a workflow edited since its last publish", () => {
    // This is the whole reason versions exist: an approval attached to v1 must not
    // silently cover a v2 nobody read.
    expect(hasUnpublishedChanges([v(1, { publishedAt: "a week ago" }), v(2)])).toBe(true);
    expect(hasUnpublishedChanges([v(1, { publishedAt: "a week ago" })])).toBe(false);
  });

  it("treats a never-published workflow as having unpublished changes", () => {
    expect(hasUnpublishedChanges([v(1)])).toBe(true);
    expect(hasUnpublishedChanges([])).toBe(false);
  });

  it("keeps the approval attached to the version that was read", () => {
    const history = [v(1, { approvedBy: "ls", approvedAt: "Monday", publishedAt: "Monday" }), v(2)];
    expect(publishedVersion(history)?.approvedBy).toBe("ls");
    expect(latestVersion(history)?.approvedBy).toBeUndefined();
  });
});

describe("schema migration", () => {
  it("treats a workflow with no schemaVersion as v1", () => {
    // The only safe reading: v1 is the shape that existed before the field did.
    const out = migrateWorkflow({ name: "Old flow" });
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.name).toBe("Old flow");
  });

  it("is a no-op on a current workflow", () => {
    const raw = { schemaVersion: CURRENT_SCHEMA_VERSION, name: "Current" };
    expect(migrateWorkflow(raw)).toEqual(raw);
    expect(needsMigration(raw)).toBe(false);
  });

  it("returns a future workflow untouched rather than mangling it", () => {
    // A newer client wrote it; silently downgrading would drop whatever it added.
    const future = { schemaVersion: CURRENT_SCHEMA_VERSION + 5, name: "From the future", extra: true };
    expect(migrateWorkflow(future)).toEqual(future);
    expect(needsMigration(future)).toBe(false);
  });

  it("never loses fields it doesn't know about", () => {
    const out = migrateWorkflow({ name: "Flow", steps: [{ id: "a" }], mystery: 42 });
    expect(out.mystery).toBe(42);
    expect(out.steps).toEqual([{ id: "a" }]);
  });

  it("is idempotent", () => {
    const once = migrateWorkflow({ name: "Flow" });
    expect(migrateWorkflow(once)).toEqual(once);
  });
});
