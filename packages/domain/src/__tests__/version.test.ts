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
    // The chain rewrites what it understands and carries everything else through
    // untouched — a migration that drops an unrecognised field is a migration that
    // loses whatever a newer feature added.
    const out = migrateWorkflow({ name: "Flow", steps: [{ id: "a" }], mystery: 42 });
    expect(out.mystery).toBe(42);
    expect(out.name).toBe("Flow");
    expect(out.steps).toEqual([{ kind: "action", id: "a" }]);
  });

  it("is idempotent", () => {
    const once = migrateWorkflow({ name: "Flow" });
    expect(migrateWorkflow(once)).toEqual(once);
  });
});

describe("the v1 → v2 migration", () => {
  it("tags every v1 step as an action", () => {
    // A v1 step had no discriminant because there was only one kind. v2 adds
    // branches, so every step must now say which it is.
    const out = migrateWorkflow({
      schemaVersion: 1,
      steps: [
        { id: "stp_1", actionId: "http.request", config: { method: "GET" } },
        { id: "stp_2", actionId: "assert.equals", config: {} },
      ],
    });
    expect(out.schemaVersion).toBe(2);
    expect(out.steps).toEqual([
      { kind: "action", id: "stp_1", actionId: "http.request", config: { method: "GET" } },
      { kind: "action", id: "stp_2", actionId: "assert.equals", config: {} },
    ]);
  });

  it("means exactly what it meant before — nothing is dropped or reordered", () => {
    const steps = [{ id: "a", actionId: "x", config: { k: "v" }, extra: 1 }, { id: "b", actionId: "y", config: {} }];
    const out = migrateWorkflow({ schemaVersion: 1, steps });
    const migrated = out.steps as Record<string, unknown>[];
    expect(migrated.map((s) => s.id)).toEqual(["a", "b"]);
    expect(migrated[0].extra).toBe(1);
  });

  it("migrates a workflow that predates the field at all", () => {
    const out = migrateWorkflow({ steps: [{ id: "a", actionId: "x", config: {} }] });
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect((out.steps as Record<string, unknown>[])[0].kind).toBe("action");
  });

  it("leaves an already-v2 flow alone, branches and all", () => {
    const v2 = {
      schemaVersion: 2,
      steps: [{ kind: "branch", id: "b1", condition: "{{ x }} == 1", then: [], else: [] }],
    };
    expect(migrateWorkflow(v2)).toEqual(v2);
  });

  it("tolerates a workflow with no steps at all", () => {
    // Mirrored workflows have none — their flow lives on another platform.
    expect(migrateWorkflow({ schemaVersion: 1 }).steps).toEqual([]);
  });
});
