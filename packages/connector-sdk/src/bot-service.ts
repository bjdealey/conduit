/**
 * BotService — the first capability service. It dispatches to every enabled
 * connector that declares `bots`, health-gates each, merges their domain models,
 * and collects a per-connector error for any that fail. It takes and returns only
 * domain types; no vendor type crosses this boundary.
 */
import { Capability, MappingError } from "@conduit/domain";
import type { Bot } from "@conduit/domain";
import { isBotProvider } from "./connector";
import type { Connector } from "./connector";
import { ConnectorRegistry } from "./registry";
import {
  consoleLogger,
  recordConnectorError,
  type ConnectorError,
  type Logger,
  type ServiceResult,
} from "./service";

/** Narrow the aggregate result to a subset of connectors. */
export type BotFilter = {
  /** Connector type / platform, e.g. "automation-anywhere". */
  platform?: string;
  /** Connector instance id, e.g. "a360-prod-eu". */
  connectorId?: string;
};

export class BotService {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async list(filter: BotFilter = {}): Promise<ServiceResult<Bot>> {
    const connectors = this.registry
      .enabledWith(Capability.Bots)
      .filter((c) => (filter.connectorId ? c.id === filter.connectorId : true))
      .filter((c) => (filter.platform ? c.type === filter.platform : true));

    const items: Bot[] = [];
    const errors: ConnectorError[] = [];

    for (const connector of connectors) {
      if (!(await this.isHealthy(connector, errors))) continue;

      if (!isBotProvider(connector)) {
        recordConnectorError(
          errors,
          this.logger,
          connector,
          "BotService",
          "unavailable",
          `declares "bots" but does not implement listBots()`,
        );
        continue;
      }

      try {
        items.push(...(await connector.listBots()));
      } catch (e) {
        const kind = e instanceof MappingError ? "mapping" : "unavailable";
        recordConnectorError(errors, this.logger, connector, "BotService", kind, messageOf(e), e);
      }
    }

    return { items, errors };
  }

  /** Health-gate a connector, recording an error and skipping it if unhealthy. */
  private async isHealthy(connector: Connector, errors: ConnectorError[]): Promise<boolean> {
    try {
      const health = await connector.health();
      if (!health.ok) {
        recordConnectorError(
          errors,
          this.logger,
          connector,
          "BotService",
          "health",
          health.detail ?? "health check reported not ok",
        );
        return false;
      }
      return true;
    } catch (e) {
      recordConnectorError(errors, this.logger, connector, "BotService", "health", messageOf(e), e);
      return false;
    }
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
