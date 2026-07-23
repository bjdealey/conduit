/**
 * Shared shape for capability-service results. A service never throws because one
 * connector is unhealthy or returns an unmappable payload — it returns the healthy
 * connectors' items plus a per-connector error entry, and logs every error.
 */
import type { Connector } from "./connector";

export type ConnectorErrorKind =
  /** Health probe failed or reported not-ok; the connector was skipped. */
  | "health"
  /** A vendor payload could not be normalised (a `MappingError`). */
  | "mapping"
  /** The provider threw for another reason (network, etc.). */
  | "unavailable";

/** One connector's failure during a capability call. */
export type ConnectorError = {
  connectorId: string;
  platform: string;
  kind: ConnectorErrorKind;
  message: string;
  /** The underlying error, for callers that want to inspect it. */
  cause?: unknown;
};

/** What every capability service returns: merged items + per-connector errors. */
export type ServiceResult<T> = {
  items: T[];
  errors: ConnectorError[];
};

/** Minimal logger seam so tests can assert that failures are surfaced. */
export interface Logger {
  error(message: string, meta?: unknown): void;
}

export const consoleLogger: Logger = {
  error: (message, meta) => console.error(message, meta ?? ""),
};

/** Record + log a per-connector error. Shared by every capability service. */
export function recordConnectorError(
  errors: ConnectorError[],
  logger: Logger,
  connector: Connector,
  service: string,
  kind: ConnectorErrorKind,
  message: string,
  cause?: unknown,
): void {
  errors.push({ connectorId: connector.id, platform: connector.type, kind, message, cause });
  logger.error(
    `[${service}] connector "${connector.id}" (${connector.type}) ${kind} error: ${message}`,
    cause,
  );
}
