/**
 * The connector contract. Every connector implements the lifecycle interface; it
 * implements one capability-provider interface *per capability it declares*, and
 * only those. Providers return domain models — nothing vendor-shaped escapes the
 * adapter, so no vendor type appears in any signature here or above it.
 */
import { Capability } from "@conduit/domain";
import type { Bot } from "@conduit/domain";

/** Result of a health probe against the vendor system. */
export type HealthStatus = {
  ok: boolean;
  checkedAt?: string;
  latencyMs?: number;
  /** Human detail, especially when `ok` is false. */
  detail?: string;
};

/** Per-capability counts pulled during a sync. */
export type SyncResult = {
  synced: Partial<Record<Capability, number>>;
};

/** Lifecycle + identity every connector implements. */
export interface Connector {
  /** Instance id, e.g. "a360-prod-eu". */
  readonly id: string;
  /** Connector type / platform, e.g. "automation-anywhere". */
  readonly type: string;
  /** Capabilities this connector declares. */
  readonly capabilities: Capability[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sync(): Promise<SyncResult>;
  health(): Promise<HealthStatus>;
}

/* ------------------------------------------------------- capability providers */
/* A connector implements exactly the providers for the capabilities it declares. */

export interface BotProvider {
  listBots(): Promise<Bot[]>;
}

// Further providers (ScheduleProvider, DeviceProvider, …) are added as each
// capability service is built. Only `bots` is wired end to end at this stage.

/* --------------------------------------------------------------- type guards */

/** True when a connector declares `bots` *and* actually implements `listBots`. */
export function isBotProvider(c: Connector): c is Connector & BotProvider {
  return (
    c.capabilities.includes(Capability.Bots) &&
    typeof (c as Partial<BotProvider>).listBots === "function"
  );
}
