/**
 * Seed → domain adapters. With no backend configured, the app still needs the
 * domain-shaped view of the estate (the same shape our API returns) so the UI can
 * render one code path. This maps the rich seed `Workflow` records onto the flat
 * canonical model, standing in for a `conduit` connector until a real one is wired.
 *
 * Both types are called `Workflow` because they are the same entity: the local one
 * is the fuller shape the prototype authors and renders, the domain one is what
 * crosses the API boundary. They converge once the library reads from the API.
 */
import type { Workflow as DomainWorkflow, WorkflowRunState } from "@conduit/domain";
import { workflows } from "./workflows";
import { members } from "./issues";

const STATE_FROM_STATUS: Record<string, WorkflowRunState> = {
  Published: "Running",
  Active: "Running",
  Paused: "Idle",
  Draft: "Disabled",
};

/** The seed library as canonical domain workflows (source: the local `seed` connector). */
export function seedConnectedWorkflows(): DomainWorkflow[] {
  return workflows.map((w) => ({
    id: `seed:${w.id}`,
    sourceId: w.id,
    platform: "conduit-native",
    connectorId: "seed",
    title: w.name,
    state: STATE_FROM_STATUS[w.status] ?? "Unknown",
    owner: members.find((m) => m.id === w.ownerId)?.name ?? w.ownerId,
  }));
}
