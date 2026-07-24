/** Canonical domain models, the capability enum, and adapter-boundary mapping. */
export { Capability, CAPABILITIES } from "./capability.ts";
export type { SourceStamped, Bot, BotState } from "./models.ts";
export { BOT_STATES } from "./models.ts";
export { MappingError } from "./errors.ts";
export type { MapContext } from "./errors.ts";
export { asRecord, requireString, requireEnum, stampId } from "./mapping.ts";
