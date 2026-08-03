/**
 * The audit trail.
 *
 * Parity work — the Control Room has one and a replacement without one is not a
 * replacement — but the tier model is what makes it load-bearing. Once citizen
 * builders can submit and professionals can promote, "who approved this, and when"
 * stops being a nice-to-have and becomes the thing that makes delegation defensible.
 *
 * Append-only by construction: there is no update or delete in this module, and there
 * should never be one. An audit log you can edit is a log nobody can rely on.
 */
import type { SourceStamped } from "./models.ts";
import type { ReviewAction } from "./review.ts";

/**
 * What kind of thing was done.
 *
 * Coarse on purpose: the categories are what someone *filters* by when answering a
 * question ("show me everything governance-related last month"), and a taxonomy with
 * one entry per action is a taxonomy nobody filters by.
 */
export const AUDIT_CATEGORIES = ["lifecycle", "execution", "governance", "connector"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Human labels for the categories. */
export const AUDIT_CATEGORY_LABEL: Readonly<Record<AuditCategory, string>> = Object.freeze({
  lifecycle: "Lifecycle",
  execution: "Execution",
  governance: "Governance",
  connector: "Connector",
});

/**
 * One recorded action.
 *
 * `SourceStamped` because the trail spans both estates: a Control Room action
 * mirrored through a connector and a native one sit in the same list, distinguished
 * by `platform` — which is the same promise the library makes.
 */
export type AuditEntry = SourceStamped & {
  category: AuditCategory;
  /** Who did it — a person's name, or the trigger that stood in for one. */
  actor: string;
  /** What they did, in past tense: "approved", "published", "disabled". */
  action: string;
  /** What it was done to, named as a reader would name it. */
  target: string;
  /** When, as a display label. */
  at: string;
  /** Optional free text — a review note, a failure reason. */
  detail?: string;
};

/** The category a lifecycle move belongs to. Every review action is governance-relevant
 *  except withdrawal, which is an author tidying up after themselves. */
export function categoryOfReviewAction(action: ReviewAction): AuditCategory {
  return action === "withdraw" ? "lifecycle" : "governance";
}

/** Past-tense verbs for the lifecycle moves, so the trail reads as a narrative. */
export const REVIEW_ACTION_VERB: Readonly<Record<ReviewAction, string>> = Object.freeze({
  submit: "submitted for review",
  approve: "approved",
  "request-changes": "requested changes on",
  publish: "published",
  pause: "paused",
  resume: "resumed",
  withdraw: "withdrew",
});

/**
 * Newest first, with a stable tie-break.
 *
 * Entries arriving in the same display minute are common — an approve and a publish
 * seconds apart — and an unstable sort makes the trail appear to reorder itself
 * between renders, which reads as tampering in exactly the surface where it must not.
 */
export function orderAudit(entries: readonly AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) => b.id.localeCompare(a.id));
}

/** Entries in a category, newest first. */
export function auditByCategory(entries: readonly AuditEntry[], category: AuditCategory): AuditEntry[] {
  return orderAudit(entries.filter((e) => e.category === category));
}
