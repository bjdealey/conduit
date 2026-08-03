import { describe, expect, it } from "vitest";
import { coerceCapabilities, coerceNodeType, coerceWorkflow, coerceWorkflows } from "../api";

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

describe("node-type catalogue coercion", () => {
  it("accepts a well-formed catalogue row", () => {
    const node = coerceNodeType({
      id: "ai.extract",
      label: "Extract from document",
      package: "ai",
      summary: "Pull structured fields out of a document.",
      fields: [{ id: "source", label: "Document", kind: "text" }],
      requires: { auth: "api-key" },
      readiness: "roadmap",
    });
    expect(node).toMatchObject({ id: "ai.extract", package: "ai", readiness: "roadmap" });
    expect(node?.requires).toEqual({ auth: "api-key" });
  });

  it("defaults readiness to live rather than hiding an unmarked node", () => {
    expect(coerceNodeType({ id: "a", label: "A", package: "p", summary: "s" })?.readiness).toBe("live");
  });

  it("drops a row missing anything the palette needs to render it", () => {
    expect(coerceNodeType({ id: "a", label: "A", package: "p" })).toBeNull();
    expect(coerceNodeType({ label: "A", package: "p", summary: "s" })).toBeNull();
    expect(coerceNodeType(null)).toBeNull();
    expect(coerceNodeType("nope")).toBeNull();
  });

  it("tolerates a missing or malformed fields array", () => {
    expect(coerceNodeType({ id: "a", label: "A", package: "p", summary: "s" })?.fields).toEqual([]);
    expect(coerceNodeType({ id: "a", label: "A", package: "p", summary: "s", fields: "no" })?.fields).toEqual([]);
  });
});
