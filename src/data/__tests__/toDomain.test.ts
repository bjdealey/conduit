import { describe, expect, it } from "vitest";
import { BOT_STATES } from "@conduit/domain";
import { seedBots } from "../toDomain";
import { automations } from "../automations";

describe("seedBots maps seed automations to canonical domain bots", () => {
  it("produces one namespaced, source-stamped Bot per automation", () => {
    const bots = seedBots();
    expect(bots).toHaveLength(automations.length);
    for (const b of bots) {
      expect(b.id).toBe(`seed:${b.sourceId}`);
      expect(b.platform).toBe("conduit-native");
      expect(b.connectorId).toBe("seed");
      expect(BOT_STATES).toContain(b.state);
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.owner.length).toBeGreaterThan(0);
    }
  });

  it("resolves the owner to a member name, not the raw id", () => {
    const reset = seedBots().find((b) => b.sourceId === "aut_reset_audit");
    expect(reset?.owner).not.toMatch(/^ls$/); // ownerId 'ls' → display name
    expect(reset?.state).toBe("Running"); // seed status "Active" → Running
  });
});
