/**
 * WorkflowService — the first capability service. It dispatches to every enabled
 * connector that declares `workflows`, health-gates each, merges their domain models,
 * and collects a per-connector error for any that fail. It takes and returns only
 * domain types; no vendor type crosses this boundary.
 */
import { Capability, MappingError } from "@conduit/domain";
import type { Workflow } from "@conduit/domain";
import { isWorkflowProvider } from "./connector.ts";
import type { Connector } from "./connector.ts";
import { ConnectorRegistry } from "./registry.ts";
import {
  consoleLogger,
  recordConnectorError,
  type ConnectorError,
  type Logger,
  type ServiceResult,
} from "./service.ts";

/** Narrow the aggregate result to a subset of connectors. */
export type BotFilter = {
  /** Connector type / platform, e.g. "automation-anywhere". */
  platform?: string;
  /** Connector instance id, e.g. "a360-prod-eu". */
  connectorId?: string;
};

export class WorkflowService {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async list(filter: BotFilter = {}): Promise<ServiceResult<Workflow>> {
    const connectors = this.registry
      .enabledWith(Capability.Workflows)
      .filter((c) => (filter.connectorId ? c.id === filter.connectorId : true))
      .filter((c) => (filter.platform ? c.type === filter.platform : true));

    const items: Workflow[] = [];
    const errors: ConnectorError[] = [];

    for (const connector of connectors) {
      if (!(await this.isHealthy(connector, errors))) continue;

      if (!isWorkflowProvider(connector)) {
        recordConnectorError(
          errors,
          this.logger,
          connector,
          "WorkflowService",
          "unavailable",
          `declares "workflows" but does not implement listWorkflows()`,
        );
        continue;
      }

      try {
        items.push(...(await connector.listWorkflows()));
      } catch (e) {
        const kind = e instanceof MappingError ? "mapping" : "unavailable";
        recordConnectorError(errors, this.logger, connector, "WorkflowService", kind, messageOf(e), e);
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
          "WorkflowService",
          "health",
          health.detail ?? "health check reported not ok",
        );
        return false;
      }
      return true;
    } catch (e) {
      recordConnectorError(errors, this.logger, connector, "WorkflowService", "health", messageOf(e), e);
      return false;
    }
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
