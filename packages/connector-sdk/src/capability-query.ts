/**
 * Ask whether a connector supports a capability *without throwing*. A capability
 * service dispatches only to connectors that declare its capability; when something
 * asks a connector for a capability it does not declare, it gets a clear, structured
 * unsupported result — never an exception.
 */
import type { Capability } from "@conduit/domain";
import type { Connector } from "./connector";

export type CapabilitySupport =
  | { supported: true; connectorId: string; capability: Capability }
  | { supported: false; connectorId: string; capability: Capability; reason: string };

export function queryCapability(connector: Connector, capability: Capability): CapabilitySupport {
  if (connector.capabilities.includes(capability)) {
    return { supported: true, connectorId: connector.id, capability };
  }
  return {
    supported: false,
    connectorId: connector.id,
    capability,
    reason: `connector "${connector.id}" (${connector.type}) does not declare capability "${capability}"`,
  };
}
