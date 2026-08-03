import { describe, expect, it } from "vitest";
import { coerceWorkflow, coerceWorkflows, coerceCapabilities } from "../api";

describe("api boundary coercion (defensive parsing of our API responses)", () => {
  it("coerceWorkflow returns a valid domain Workflow and guards the state field", () => {
    const bot = coerceWorkflow({
      id: "a360-eu:1",
      sourceId: "1",
      platform: "automation-anywhere",
      connectorId: "a360-eu",
      title: "Invoice Workflow",
      state: "Running",
      owner: "Brad",
    });
    expect(bot).toEqual({
      id: "a360-eu:1",
      sourceId: "1",
      platform: "automation-anywhere",
      connectorId: "a360-eu",
      title: "Invoice Workflow",
      state: "Running",
      owner: "Brad",
    });
  });

  it("coerceWorkflow folds an unknown state to Unknown and rejects incomplete rows", () => {
    const weird = coerceWorkflow({ id: "x:1", sourceId: "1", platform: "p", connectorId: "x", title: "T", state: "EXPLODED", owner: "O" });
    expect(weird?.state).toBe("Unknown");
    // Missing required fields → not a Workflow.
    expect(coerceWorkflow({ id: "x", title: "no owner" })).toBeNull();
    expect(coerceWorkflow(null)).toBeNull();
    expect(coerceWorkflow("nope")).toBeNull();
  });

  it("coerceWorkflows drops malformed rows instead of rendering junk", () => {
    const connected = coerceWorkflows([
      { id: "x:1", sourceId: "1", platform: "p", connectorId: "x", title: "Good", state: "Idle", owner: "O" },
      { id: "x:2", title: "broken" },
      42,
    ]);
    expect(connected.map((b) => b.id)).toEqual(["x:1"]);
    expect(coerceWorkflows("not an array")).toEqual([]);
  });

  it("coerceCapabilities keeps only recognised capability ids", () => {
    expect(coerceCapabilities(["workflows", "schedules", "made-up", 7])).toEqual(["workflows", "schedules"]);
    expect(coerceCapabilities(null)).toEqual([]);
  });
});
