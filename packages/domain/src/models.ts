/**
 * Canonical domain models. Every model is normalised, flat, and carries its source
 * system — nothing vendor-shaped reaches a consumer of these types.
 *
 * Reference shape (from the plan / CLAUDE.md):
 *   { id, title, state, platform, owner }
 */

/**
 * Fields every domain model carries so its origin is never ambiguous.
 *
 * - `id` is namespaced (`${connectorId}:${sourceId}`) so two instances of the same
 *   connector type (e.g. two A360 Control Rooms) can surface the same vendor id
 *   without colliding.
 * - `sourceId` preserves the raw vendor id for round-trips.
 * - `platform` is the connector *type* (e.g. "automation-anywhere").
 * - `connectorId` is the connector *instance* (e.g. "a360-prod-eu").
 */
export type SourceStamped = {
  id: string;
  sourceId: string;
  platform: string;
  connectorId: string;
};

/** Normalised bot run-state. Vendor-specific states map onto this at the adapter. */
export const BOT_STATES = ["Running", "Idle", "Disabled", "Unknown"] as const;
export type BotState = (typeof BOT_STATES)[number];

/** A bot / automation definition. The first capability wired end to end. */
export type Bot = SourceStamped & {
  title: string;
  state: BotState;
  owner: string;
};
