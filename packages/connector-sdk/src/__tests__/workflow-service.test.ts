import { describe, expect, it, vi } from "vitest";
import { Capability } from "@conduit/domain";
import { WorkflowService, ConnectorRegistry, type Logger } from "../index";
import { FakeConnector, fakeConnectorFactory, type FakeBotPayload } from "../testing";

/** A valid vendor-shaped workflow payload with an overridable field. */
const workflow = (over: Partial<FakeBotPayload> = {}): FakeBotPayload => ({
  botId: "b1",
  label: "Invoice Workflow",
  status: "Running",
  assignee: "Brad",
  ...over,
});

const capturingLogger = (): Logger & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, error: (m) => calls.push(m) };
};

describe("Acceptance 1: a service returns results only from enabled connectors that declare the capability", () => {
  it("includes workflows-capable connectors and skips those that do not declare workflows", async () => {
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "has-workflows", workflows: [workflow({ botId: "1" })] }));
    registry.register(
      new FakeConnector({ id: "no-workflows", capabilities: [Capability.Schedules], workflows: [workflow({ botId: "2" })] }),
    );

    const { items, errors } = await new WorkflowService(registry).list();

    expect(items).toHaveLength(1);
    expect(items[0].connectorId).toBe("has-workflows");
    expect(errors).toEqual([]);
  });
});

describe("Acceptance 2: disabling a connector at runtime removes its data with no restart and no error", () => {
  it("drops a disabled connector's workflows and restores them on re-enable", async () => {
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "c1", workflows: [workflow({ botId: "1" })] }));
    registry.register(new FakeConnector({ id: "c2", workflows: [workflow({ botId: "2" })] }));
    const service = new WorkflowService(registry);

    expect((await service.list()).items).toHaveLength(2);

    registry.disable("c2");
    const afterDisable = await service.list();
    expect(afterDisable.items.map((b) => b.connectorId)).toEqual(["c1"]);
    expect(afterDisable.errors).toEqual([]);

    registry.enable("c2");
    expect((await service.list()).items).toHaveLength(2);
  });
});

describe("Acceptance 3: two instances of the same type are addressable independently and distinguishable", () => {
  it("builds two instances of one type from config and keeps their results distinct", async () => {
    const registry = new ConnectorRegistry();
    registry.defineType(fakeConnectorFactory("acme-cloud"));
    registry.add({ id: "acme-eu", type: "acme-cloud", config: { workflows: [workflow({ botId: "b1", label: "EU Workflow", assignee: "Brad" })] } });
    registry.add({ id: "acme-us", type: "acme-cloud", config: { workflows: [workflow({ botId: "b1", label: "US Workflow", status: "Idle", assignee: "Dana" })] } });
    const service = new WorkflowService(registry);

    const { items } = await service.list();
    // Same vendor id "b1" on both, but namespaced ids never collide.
    expect(items.map((b) => b.id).sort()).toEqual(["acme-eu:b1", "acme-us:b1"]);
    expect(items.find((b) => b.connectorId === "acme-eu")?.title).toBe("EU Workflow");
    expect(items.find((b) => b.connectorId === "acme-us")?.title).toBe("US Workflow");
    expect(items.every((b) => b.platform === "acme-cloud")).toBe(true);

    // Independently addressable by instance.
    const eu = await service.list({ connectorId: "acme-eu" });
    expect(eu.items).toHaveLength(1);
    expect(eu.items[0].id).toBe("acme-eu:b1");
  });
});

describe("Acceptance 4: a failing health check degrades gracefully", () => {
  it("returns healthy results plus a per-connector error and does not throw", async () => {
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "healthy", workflows: [workflow({ botId: "1" })] }));
    registry.register(new FakeConnector({ id: "sick", healthy: false, workflows: [workflow({ botId: "2" })] }));
    registry.register(new FakeConnector({ id: "boom", failHealth: true, workflows: [workflow({ botId: "3" })] }));

    const { items, errors } = await new WorkflowService(registry).list();

    expect(items).toHaveLength(1);
    expect(items[0].connectorId).toBe("healthy");
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.kind === "health")).toBe(true);
    expect(errors.map((e) => e.connectorId).sort()).toEqual(["boom", "sick"]);
  });
});

describe("Acceptance 5: an unmappable vendor payload fails loudly, never as a silent partial model", () => {
  it("surfaces a logged mapping error and yields no partial workflow", async () => {
    const logger = capturingLogger();
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "good", workflows: [workflow({ botId: "1", label: "Good" })] }));
    // Missing `status` — the required run-state field.
    registry.register(new FakeConnector({ id: "bad", workflows: [{ botId: "2", label: "Bad", assignee: "Y" }] }));

    const { items, errors } = await new WorkflowService(registry, logger).list();

    // The good connector's workflow is present and fully populated.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "good:1",
      sourceId: "1",
      platform: "fake",
      connectorId: "good",
      title: "Good",
      state: "Running",
      owner: "Brad",
    });
    // No partial model leaked from the bad connector.
    expect(items.some((b) => b.connectorId === "bad")).toBe(false);

    // Explicit, logged mapping error.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ connectorId: "bad", kind: "mapping" });
    expect(logger.calls.join("\n")).toContain("mapping");
  });
});
