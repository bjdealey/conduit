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
import type { Member, Workflow } from "./types";

const STATE_FROM_STATUS: Record<string, WorkflowRunState> = {
  Published: "Running",
  Active: "Running",
  Paused: "Idle",
  Draft: "Disabled",
};

/**
 * The local library as canonical domain workflows (source: the local `seed`
 * connector).
 *
 * Takes the collections rather than importing them, because what the library holds
 * is now a runtime question — a clean install, the sample estate, or whatever has
 * been authored since — and a module-scope import would answer it once, at load,
 * and then be wrong for the rest of the session.
 */
export function seedConnectedWorkflows(
  workflows: readonly Workflow[],
  members: readonly Member[],
): DomainWorkflow[] {
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
