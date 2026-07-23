/**
 * The Automation Anywhere A360 connector package. Exposes a data-driven factory so
 * the registry can build instances from plain config alone — one row per Control Room.
 */
import { defineConnector, type ConnectorFactory, type SecretStore } from "@conduit/connector-sdk";
import { A360_CAPABILITIES, A360_TYPE } from "./config";
import { A360Connector, type A360ConnectorDeps } from "./connector";

export { A360Connector, type A360ConnectorDeps } from "./connector";
export { A360_TYPE, A360_CAPABILITIES, type A360Config } from "./config";
export { A360AuthError } from "./session";
export { normalizeStatus, mapA360Bot } from "./map";
export type { HttpTransport, HttpRequest, HttpResponse } from "./http";

/**
 * Build the A360 connector factory. The `SecretStore` is shared across instances, but
 * each instance only ever resolves its own `config.secretRef`, so one Control Room's
 * connector cannot read another's credentials.
 */
export function a360ConnectorFactory(secrets: SecretStore, deps?: A360ConnectorDeps): ConnectorFactory {
  return defineConnector({
    type: A360_TYPE,
    capabilities: [...A360_CAPABILITIES],
    create: (instance) => new A360Connector(instance.id, instance.config ?? {}, secrets, deps),
  });
}
