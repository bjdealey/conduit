/**
 * Seed → domain adapters. With no backend configured, the app still needs a domain
 * `Bot[]` view (the same shape the API returns) so the UI can render one code path.
 * This maps the rich seed `Automation` records onto the canonical `Bot`, standing in for
 * a `conduit-native` connector until a real one is wired.
 */
import type { Bot, BotState } from "@conduit/domain";
import { automations } from "./automations";
import { members } from "./issues";

const STATE_FROM_AUTOMATION: Record<string, BotState> = {
  Active: "Running",
  Paused: "Idle",
  Draft: "Disabled",
};

/** The seed automations as canonical domain bots (source: the local `seed` connector). */
export function seedBots(): Bot[] {
  return automations.map((a) => ({
    id: `seed:${a.id}`,
    sourceId: a.id,
    platform: "conduit-native",
    connectorId: "seed",
    title: a.name,
    state: STATE_FROM_AUTOMATION[a.status] ?? "Unknown",
    owner: members.find((m) => m.id === a.ownerId)?.name ?? a.ownerId,
  }));
}
