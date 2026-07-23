/**
 * Connector registry + lifecycle. Registration is data-driven: connector *types*
 * are registered as factories, and *instances* are built from plain config, so
 * adding a connector never touches the service layer. Multiple instances of one
 * type are just multiple `add()` calls with different config.
 */
import { Capability } from "@conduit/domain";
import type { Connector, HealthStatus } from "./connector";

/** Plain, serialisable description of a connector instance (a registry row). */
export type ConnectorInstanceConfig = {
  id: string;
  type: string;
  name?: string;
  /** Defaults to true. */
  enabled?: boolean;
  /** Non-secret connection/config. Secrets are resolved server-side, not here. */
  config?: Record<string, unknown>;
};

/** A connector type: its declared capabilities and how to build an instance. */
export interface ConnectorFactory {
  readonly type: string;
  readonly capabilities: Capability[];
  create(instance: ConnectorInstanceConfig): Connector;
}

/** Identity helper so a factory literal reads well at the call site. */
export function defineConnector(factory: ConnectorFactory): ConnectorFactory {
  return factory;
}

type Registered = { connector: Connector; enabled: boolean };

export class ConnectorRegistry {
  private readonly types = new Map<string, ConnectorFactory>();
  private readonly instances = new Map<string, Registered>();

  /** Register a connector *type* (data-driven; services never import connectors). */
  defineType(factory: ConnectorFactory): void {
    this.types.set(factory.type, factory);
  }

  hasType(type: string): boolean {
    return this.types.has(type);
  }

  /** Build and register an instance from config, using its type's factory. */
  add(config: ConnectorInstanceConfig): Connector {
    const factory = this.types.get(config.type);
    if (!factory) throw new Error(`No connector type registered for "${config.type}"`);
    if (this.instances.has(config.id)) {
      throw new Error(`Connector instance "${config.id}" is already registered`);
    }
    const connector = factory.create(config);
    this.instances.set(config.id, { connector, enabled: config.enabled ?? true });
    return connector;
  }

  /** Register an already-constructed connector (custom wiring / tests). */
  register(connector: Connector, enabled = true): void {
    if (this.instances.has(connector.id)) {
      throw new Error(`Connector instance "${connector.id}" is already registered`);
    }
    this.instances.set(connector.id, { connector, enabled });
  }

  /** Enable an instance at runtime — its data reappears on the next call. */
  enable(id: string): void {
    this.mustGet(id).enabled = true;
  }

  /** Disable an instance at runtime — its data drops out with no restart. */
  disable(id: string): void {
    this.mustGet(id).enabled = false;
  }

  /** Remove an instance entirely. */
  remove(id: string): void {
    if (!this.instances.delete(id)) throw new Error(`Unknown connector "${id}"`);
  }

  get(id: string): Connector | undefined {
    return this.instances.get(id)?.connector;
  }

  isEnabled(id: string): boolean {
    return this.instances.get(id)?.enabled ?? false;
  }

  list(): Connector[] {
    return [...this.instances.values()].map((r) => r.connector);
  }

  /** Enabled connectors that declare `capability` — the set a service dispatches to. */
  enabledWith(capability: Capability): Connector[] {
    return [...this.instances.values()]
      .filter((r) => r.enabled && r.connector.capabilities.includes(capability))
      .map((r) => r.connector);
  }

  /** Probe one instance's health. */
  health(id: string): Promise<HealthStatus> {
    return this.mustGet(id).connector.health();
  }

  private mustGet(id: string): Registered {
    const r = this.instances.get(id);
    if (!r) throw new Error(`Unknown connector "${id}"`);
    return r;
  }
}
