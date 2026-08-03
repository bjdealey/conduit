import { describe, expect, it } from "vitest";
import {
  AWAITING_REVIEW,
  ROLES,
  WORKFLOW_STATUSES,
  availableTransitions,
  can,
  canTransition,
  isRunnable,
  permissionsOf,
  transitionsFrom,
  type Role,
  type WorkflowStatus,
} from "../review.ts";

describe("tiers", () => {
  it("lets every tier trigger, which is the point of the consumer tier", () => {
    for (const role of ROLES) expect(can(role, "trigger"), role).toBe(true);
  });

  it("keeps a consumer out of authoring entirely", () => {
    expect(can("consumer", "author")).toBe(false);
    expect(can("consumer", "submit")).toBe(false);
    expect(permissionsOf("consumer")).toEqual(["trigger"]);
  });

  it("lets a citizen builder author and submit but never approve their own work", () => {
    expect(can("builder", "author")).toBe(true);
    expect(can("builder", "submit")).toBe(true);
    // The gap between submit and publish is the entire reason the model is safe.
    expect(can("builder", "review")).toBe(false);
    expect(can("builder", "publish")).toBe(false);
  });

  it("gives professionals review and publish, and admins governance on top", () => {
    expect(can("professional", "review")).toBe(true);
    expect(can("professional", "publish")).toBe(true);
    expect(can("professional", "administer")).toBe(false);
    expect(can("admin", "administer")).toBe(true);
  });

  it("grants strictly more as the tiers ascend", () => {
    const order: Role[] = ["consumer", "builder", "professional", "admin"];
    for (let i = 1; i < order.length; i++) {
      const lower = permissionsOf(order[i - 1]);
      const higher = permissionsOf(order[i]);
      expect(lower.every((p) => higher.includes(p)), `${order[i]} ⊇ ${order[i - 1]}`).toBe(true);
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });
});

describe("the lifecycle", () => {
  it("routes citizen work Draft → In review → Approved → Published", () => {
    expect(canTransition("builder", "Draft", "submit")).toBe(true);
    expect(canTransition("professional", "In review", "approve")).toBe(true);
    expect(canTransition("professional", "Approved", "publish")).toBe(true);
  });

  it("never lets a builder move their own work past review", () => {
    expect(canTransition("builder", "In review", "approve")).toBe(false);
    expect(canTransition("builder", "Approved", "publish")).toBe(false);
    expect(availableTransitions("builder", "Approved")).toEqual([]);
  });

  it("has no path that skips approval, even for a professional", () => {
    // Publishing always goes through Approved, so every published workflow carries an
    // approval regardless of who wrote it.
    for (const role of ROLES) {
      expect(canTransition(role, "Draft", "publish"), role).toBe(false);
      const fromDraft = availableTransitions(role, "Draft").map((t) => t.to);
      expect(fromDraft.includes("Published"), role).toBe(false);
    }
  });

  it("lets changes be requested from review and after approval", () => {
    expect(canTransition("professional", "In review", "request-changes")).toBe(true);
    // An approval can still be pulled back before it is published.
    expect(canTransition("professional", "Approved", "request-changes")).toBe(true);
  });

  it("loops changes back for another pass rather than dead-ending", () => {
    expect(canTransition("builder", "Changes requested", "submit")).toBe(true);
    expect(transitionsFrom("Changes requested")).toHaveLength(1);
  });

  it("lets an author withdraw a submission but not approve it", () => {
    expect(canTransition("builder", "In review", "withdraw")).toBe(true);
    expect(availableTransitions("builder", "In review").map((t) => t.action)).toEqual(["withdraw"]);
  });

  it("offers a consumer nothing at any point in the lifecycle", () => {
    for (const status of WORKFLOW_STATUSES) {
      expect(availableTransitions("consumer", status), status).toEqual([]);
    }
  });

  it("pauses and resumes a published workflow", () => {
    expect(canTransition("professional", "Published", "pause")).toBe(true);
    expect(canTransition("professional", "Paused", "resume")).toBe(true);
  });

  it("only counts a published workflow as runnable", () => {
    for (const status of WORKFLOW_STATUSES) {
      expect(isRunnable(status), status).toBe(status === "Published");
    }
  });

  it("lands every transition on a real status", () => {
    const known = new Set<string>(WORKFLOW_STATUSES);
    for (const status of WORKFLOW_STATUSES) {
      for (const t of transitionsFrom(status)) {
        expect(known.has(t.to), `${status} → ${t.to}`).toBe(true);
        expect(t.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("puts exactly the reviewer-blocked states in the queue", () => {
    // A queue that includes Draft would show reviewers work nobody has handed them.
    const blocked = WORKFLOW_STATUSES.filter((s: WorkflowStatus) =>
      availableTransitions("professional", s).some((t) => t.needs === "review"),
    );
    expect([...AWAITING_REVIEW].sort()).toEqual(blocked.sort());
  });
});
