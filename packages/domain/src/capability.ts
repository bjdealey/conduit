/**
 * The capabilities a connector can declare. The UI enables features from the
 * declared-capability union across enabled connectors — never from a connector's
 * vendor identity. One capability maps to exactly one capability service.
 */
/*
 * A frozen object plus a union type, rather than a TypeScript `enum`.
 *
 * `Capability.Workflows` and `Capability[]` read exactly as they did — this is the one
 * refactor of an enum that changes no call site. What it does change is who can run
 * this package: an `enum` is the rare TypeScript construct that *emits* code, so a
 * runtime that strips types rather than compiling them (Node's own `.ts` support, and
 * therefore the runner CLI in `runner/`) refuses the whole module. The domain package
 * is the file the runtime team codes against; it has to be loadable by the thing they
 * are building. Keep this module — and everything the execution plane imports —
 * free of `enum`, parameter properties, and namespaces for the same reason.
 */
export const Capability = Object.freeze({
  Workflows: "workflows",
  Schedules: "schedules",
  Devices: "devices",
  Credentials: "credentials",
  Activity: "activity",
  Audit: "audit",
  Packages: "packages",
  Queues: "queues",
} as const);

/** One capability id. */
export type Capability = (typeof Capability)[keyof typeof Capability];

/** All capability ids, for iteration / validation. */
export const CAPABILITIES = Object.freeze(Object.values(Capability)) as readonly Capability[];
