/** The connector contract, the data-driven registry, and capability services. */
export type { Connector, BotProvider, HealthStatus, SyncResult } from "./connector";
export { isBotProvider } from "./connector";
export {
  ConnectorRegistry,
  defineConnector,
  type ConnectorFactory,
  type ConnectorInstanceConfig,
} from "./registry";
export {
  consoleLogger,
  recordConnectorError,
  type ConnectorError,
  type ConnectorErrorKind,
  type Logger,
  type ServiceResult,
} from "./service";
export { BotService, type BotFilter } from "./bot-service";
