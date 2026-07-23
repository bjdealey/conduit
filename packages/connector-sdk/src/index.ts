/** The connector contract, the data-driven registry, and capability services. */
export type { Connector, BotProvider, HealthStatus, SyncResult } from "./connector.ts";
export { isBotProvider } from "./connector.ts";
export {
  ConnectorRegistry,
  defineConnector,
  type ConnectorFactory,
  type ConnectorInstanceConfig,
} from "./registry.ts";
export {
  consoleLogger,
  recordConnectorError,
  type ConnectorError,
  type ConnectorErrorKind,
  type Logger,
  type ServiceResult,
} from "./service.ts";
export { BotService, type BotFilter } from "./bot-service.ts";
export {
  InMemorySecretStore,
  SupabaseVaultSecretStore,
  SecretNotFoundError,
  type SecretStore,
  type SecretRecord,
  type SecretMetadata,
  type VaultClient,
} from "./secrets.ts";
export { queryCapability, type CapabilitySupport } from "./capability-query.ts";
