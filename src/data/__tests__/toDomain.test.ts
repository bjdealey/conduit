import { describe, expect, it } from "vitest";
import { WORKFLOW_RUN_STATES } from "@conduit/domain";
import { seedConnectedWorkflows } from "../toDomain";
import { workflows } from "../workflows";
import { members } from "../issues";

describe("seedConnectedWorkflows maps seed workflows to canonical domain connected", () => {
  it("produces one namespaced, source-stamped Workflow per workflow", () => {
    const connected = seedConnectedWorkflows(workflows, members);
    expect(connected).toHaveLength(workflows.length);
    for (const b of connected) {
      expect(b.id).toBe(`seed:${b.sourceId}`);
      expect(b.platform).toBe("conduit-native");
      expect(b.connectorId).toBe("seed");
      expect(WORKFLOW_RUN_STATES).toContain(b.state);
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.owner.length).toBeGreaterThan(0);
    }
  });

  it("resolves the owner to a member name, not the raw id", () => {
    const reset = seedConnectedWorkflows(workflows, members).find((b) => b.sourceId === "wf_reset_audit");
    expect(reset?.owner).not.toMatch(/^ls$/); // ownerId 'ls' → display name
    expect(reset?.state).toBe("Running"); // seed status "Active" → Running
  });
});
