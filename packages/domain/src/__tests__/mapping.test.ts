import { describe, expect, it } from "vitest";
import { WORKFLOW_RUN_STATES, MappingError, asRecord, requireEnum, requireString, stampId } from "../index";

const ctx = { connectorId: "inst-1", platform: "fake", capability: "workflows" };

describe("mapping primitives fail loudly", () => {
  it("asRecord rejects non-object payloads with a MappingError", () => {
    for (const bad of [null, undefined, 42, "nope", [1, 2]]) {
      expect(() => asRecord(bad, ctx)).toThrow(MappingError);
    }
    expect(asRecord({ a: 1 }, ctx)).toEqual({ a: 1 });
  });

  it("requireString rejects missing / empty / non-string fields with field context", () => {
    expect(() => requireString({}, "botId", ctx)).toThrow(MappingError);
    expect(() => requireString({ botId: "" }, "botId", ctx)).toThrow(MappingError);
    try {
      requireString({ botId: 7 }, "botId", ctx);
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MappingError);
      const me = e as MappingError;
      expect(me.field).toBe("botId");
      expect(me.received).toBe(7);
      expect(me.connectorId).toBe("inst-1");
    }
    expect(requireString({ botId: "b1" }, "botId", ctx)).toBe("b1");
  });

  it("requireEnum rejects values outside the allowed set", () => {
    expect(() => requireEnum({ status: "Exploded" }, "status", WORKFLOW_RUN_STATES, ctx)).toThrow(MappingError);
    expect(requireEnum({ status: "Running" }, "status", WORKFLOW_RUN_STATES, ctx)).toBe("Running");
  });

  it("stampId namespaces the vendor id by instance", () => {
    expect(stampId("a360-eu", "b1")).toBe("a360-eu:b1");
  });
});
