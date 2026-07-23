import { describe, expect, it, vi } from "vitest";
import { Capability } from "@conduit/domain";
import { BotService, ConnectorRegistry, type Logger } from "../index";
import { FakeConnector, fakeConnectorFactory, type FakeBotPayload } from "../testing";

/** A valid vendor-shaped bot payload with an overridable field. */
const bot = (over: Partial<FakeBotPayload> = {}): FakeBotPayload => ({
  botId: "b1",
  label: "Invoice Bot",
  status: "Running",
  assignee: "Brad",
  ...over,
});

const capturingLogger = (): Logger & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, error: (m) => calls.push(m) };
};

describe("Acceptance 1: a service returns results only from enabled connectors that declare the capability", () => {
  it("includes bots-capable connectors and skips those that do not declare bots", async () => {
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "has-bots", bots: [bot({ botId: "1" })] }));
    registry.register(
      new FakeConnector({ id: "no-bots", capabilities: [Capability.Schedules], bots: [bot({ botId: "2" })] }),
    );

    const { items, errors } = await new BotService(registry).list();

    expect(items).toHaveLength(1);
    expect(items[0].connectorId).toBe("has-bots");
    expect(errors).toEqual([]);
  });
});

describe("Acceptance 2: disabling a connector at runtime removes its data with no restart and no error", () => {
  it("drops a disabled connector's bots and restores them on re-enable", async () => {
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "c1", bots: [bot({ botId: "1" })] }));
    registry.register(new FakeConnector({ id: "c2", bots: [bot({ botId: "2" })] }));
    const service = new BotService(registry);

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
  it("builds two A360 instances from config and keeps their results distinct", async () => {
    const registry = new ConnectorRegistry();
    registry.defineType(fakeConnectorFactory("automation-anywhere"));
    registry.add({ id: "a360-eu", type: "automation-anywhere", config: { bots: [bot({ botId: "b1", label: "EU Bot", assignee: "Brad" })] } });
    registry.add({ id: "a360-us", type: "automation-anywhere", config: { bots: [bot({ botId: "b1", label: "US Bot", status: "Idle", assignee: "Dana" })] } });
    const service = new BotService(registry);

    const { items } = await service.list();
    // Same vendor id "b1" on both, but namespaced ids never collide.
    expect(items.map((b) => b.id).sort()).toEqual(["a360-eu:b1", "a360-us:b1"]);
    expect(items.find((b) => b.connectorId === "a360-eu")?.title).toBe("EU Bot");
    expect(items.find((b) => b.connectorId === "a360-us")?.title).toBe("US Bot");
    expect(items.every((b) => b.platform === "automation-anywhere")).toBe(true);

    // Independently addressable by instance.
    const eu = await service.list({ connectorId: "a360-eu" });
    expect(eu.items).toHaveLength(1);
    expect(eu.items[0].id).toBe("a360-eu:b1");
  });
});

describe("Acceptance 4: a failing health check degrades gracefully", () => {
  it("returns healthy results plus a per-connector error and does not throw", async () => {
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "healthy", bots: [bot({ botId: "1" })] }));
    registry.register(new FakeConnector({ id: "sick", healthy: false, bots: [bot({ botId: "2" })] }));
    registry.register(new FakeConnector({ id: "boom", failHealth: true, bots: [bot({ botId: "3" })] }));

    const { items, errors } = await new BotService(registry).list();

    expect(items).toHaveLength(1);
    expect(items[0].connectorId).toBe("healthy");
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.kind === "health")).toBe(true);
    expect(errors.map((e) => e.connectorId).sort()).toEqual(["boom", "sick"]);
  });
});

describe("Acceptance 5: an unmappable vendor payload fails loudly, never as a silent partial model", () => {
  it("surfaces a logged mapping error and yields no partial bot", async () => {
    const logger = capturingLogger();
    const registry = new ConnectorRegistry();
    registry.register(new FakeConnector({ id: "good", bots: [bot({ botId: "1", label: "Good" })] }));
    // Missing `status` — the required run-state field.
    registry.register(new FakeConnector({ id: "bad", bots: [{ botId: "2", label: "Bad", assignee: "Y" }] }));

    const { items, errors } = await new BotService(registry, logger).list();

    // The good connector's bot is present and fully populated.
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
