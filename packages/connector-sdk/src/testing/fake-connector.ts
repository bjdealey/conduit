/**
 * FakeConnector — a test double, used only by tests. It carries deliberately
 * vendor-shaped payloads (field names `botId` / `label` / `status` / `assignee`,
 * not the domain names) and maps them to domain models at its `listWorkflows` boundary,
 * so tests exercise the real adapter path: a bad payload throws `MappingError`
 * rather than producing a partial `Workflow`.
 */
import { WORKFLOW_RUN_STATES, Capability, asRecord, requireEnum, requireString, stampId } from "@conduit/domain";
import type { Workflow, MapContext } from "@conduit/domain";
import type { WorkflowProvider, Connector, HealthStatus, SyncResult } from "../connector";
import { defineConnector, type ConnectorFactory, type ConnectorInstanceConfig } from "../registry";

/** A raw, vendor-shaped workflow payload as it would arrive before mapping. */
export type FakeBotPayload = {
  botId?: unknown;
  label?: unknown;
  status?: unknown;
  assignee?: unknown;
};

export type FakeConnectorOptions = {
  id: string;
  /** Becomes the connector `type` / `platform`. Default "fake". */
  platform?: string;
  /** Declared capabilities. Default `[Capability.Workflows]`. */
  capabilities?: Capability[];
  /** Raw vendor payloads the fake will map in `listWorkflows`. */
  workflows?: FakeBotPayload[];
  /** `health()` returns `{ ok: healthy }`. Default true. */
  healthy?: boolean;
  /** When true, `health()` throws instead of returning. Default false. */
  failHealth?: boolean;
};

export class FakeConnector implements Connector, WorkflowProvider {
  readonly id: string;
  readonly type: string;
  readonly capabilities: Capability[];
  private readonly workflows: FakeBotPayload[];
  private readonly healthy: boolean;
  private readonly failHealth: boolean;
  connected = false;

  constructor(opts: FakeConnectorOptions) {
    this.id = opts.id;
    this.type = opts.platform ?? "fake";
    this.capabilities = opts.capabilities ?? [Capability.Workflows];
    this.workflows = opts.workflows ?? [];
    this.healthy = opts.healthy ?? true;
    this.failHealth = opts.failHealth ?? false;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async sync(): Promise<SyncResult> {
    return { synced: { [Capability.Workflows]: this.workflows.length } };
  }

  async health(): Promise<HealthStatus> {
    if (this.failHealth) throw new Error(`fake health probe failed for "${this.id}"`);
    return { ok: this.healthy, detail: this.healthy ? undefined : "fake connector marked unhealthy" };
  }

  async listWorkflows(): Promise<Workflow[]> {
    const ctx: MapContext = { connectorId: this.id, platform: this.type, capability: "workflows" };
    return this.workflows.map((raw) => mapFakeBot(raw, ctx));
  }
}

/** Map one vendor-shaped payload to a domain `Workflow`, failing loudly on bad input. */
function mapFakeBot(raw: unknown, ctx: MapContext): Workflow {
  const rec = asRecord(raw, ctx);
  const sourceId = requireString(rec, "botId", ctx);
  const withId = { ...ctx, sourceId };
  const title = requireString(rec, "label", withId);
  const state = requireEnum(rec, "status", WORKFLOW_RUN_STATES, withId);
  const owner = requireString(rec, "assignee", withId);
  return {
    id: stampId(ctx.connectorId, sourceId),
    sourceId,
    platform: ctx.platform,
    connectorId: ctx.connectorId,
    title,
    state,
    owner,
  };
}

/**
 * A data-driven factory for the fake, so the registry can build multiple instances
 * of the same type from config alone. `config.workflows` / `config.capabilities` /
 * `config.healthy` / `config.failHealth` drive each instance.
 */
export function fakeConnectorFactory(type = "fake"): ConnectorFactory {
  return defineConnector({
    type,
    capabilities: [Capability.Workflows],
    create: (instance: ConnectorInstanceConfig) =>
      new FakeConnector({
        id: instance.id,
        platform: type,
        capabilities: (instance.config?.capabilities as Capability[]) ?? [Capability.Workflows],
        workflows: (instance.config?.workflows as FakeBotPayload[]) ?? [],
        healthy: (instance.config?.healthy as boolean | undefined) ?? true,
        failHealth: (instance.config?.failHealth as boolean | undefined) ?? false,
      }),
  });
}
