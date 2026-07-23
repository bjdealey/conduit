/** Canonical domain models, the capability enum, and adapter-boundary mapping. */
export { Capability, CAPABILITIES } from "./capability";
export type { SourceStamped, Bot, BotState } from "./models";
export { BOT_STATES } from "./models";
export { MappingError } from "./errors";
export type { MapContext } from "./errors";
export { asRecord, requireString, requireEnum, stampId } from "./mapping";
