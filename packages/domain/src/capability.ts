/**
 * The capabilities a connector can declare. The UI enables features from the
 * declared-capability union across enabled connectors — never from a connector's
 * vendor identity. One capability maps to exactly one capability service.
 */
export enum Capability {
  Bots = "bots",
  Schedules = "schedules",
  Devices = "devices",
  Credentials = "credentials",
  Activity = "activity",
  Audit = "audit",
  Packages = "packages",
  Queues = "queues",
}

/** All capability ids, for iteration / validation. */
export const CAPABILITIES = Object.freeze(Object.values(Capability)) as readonly Capability[];
