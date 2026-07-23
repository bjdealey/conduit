import { describe, expect, it } from "vitest";
import { coerceBot, coerceBots, coerceCapabilities } from "../api";

describe("api boundary coercion (defensive parsing of our API responses)", () => {
  it("coerceBot returns a valid domain Bot and guards the state field", () => {
    const bot = coerceBot({
      id: "a360-eu:1",
      sourceId: "1",
      platform: "automation-anywhere",
      connectorId: "a360-eu",
      title: "Invoice Bot",
      state: "Running",
      owner: "Brad",
    });
    expect(bot).toEqual({
      id: "a360-eu:1",
      sourceId: "1",
      platform: "automation-anywhere",
      connectorId: "a360-eu",
      title: "Invoice Bot",
      state: "Running",
      owner: "Brad",
    });
  });

  it("coerceBot folds an unknown state to Unknown and rejects incomplete rows", () => {
    const weird = coerceBot({ id: "x:1", sourceId: "1", platform: "p", connectorId: "x", title: "T", state: "EXPLODED", owner: "O" });
    expect(weird?.state).toBe("Unknown");
    // Missing required fields → not a Bot.
    expect(coerceBot({ id: "x", title: "no owner" })).toBeNull();
    expect(coerceBot(null)).toBeNull();
    expect(coerceBot("nope")).toBeNull();
  });

  it("coerceBots drops malformed rows instead of rendering junk", () => {
    const bots = coerceBots([
      { id: "x:1", sourceId: "1", platform: "p", connectorId: "x", title: "Good", state: "Idle", owner: "O" },
      { id: "x:2", title: "broken" },
      42,
    ]);
    expect(bots.map((b) => b.id)).toEqual(["x:1"]);
    expect(coerceBots("not an array")).toEqual([]);
  });

  it("coerceCapabilities keeps only recognised capability ids", () => {
    expect(coerceCapabilities(["bots", "schedules", "made-up", 7])).toEqual(["bots", "schedules"]);
    expect(coerceCapabilities(null)).toEqual([]);
  });
});
