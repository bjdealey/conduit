/**
 * Seed audit trail.
 *
 * Deliberately mixed across both estates and all four categories, because the point
 * of the surface is that one trail covers everything: a Control Room action mirrored
 * through the A360 connector sits beside a native approval, distinguished only by
 * `platform` — the same promise the library makes.
 *
 * Ids sort lexicographically in chronological order (`aud_0001` upward), which is
 * what `orderAudit` relies on for a stable newest-first read.
 */
import type { AuditEntry } from "@conduit/domain";

const native = (id: string, e: Omit<AuditEntry, "id" | "sourceId" | "platform" | "connectorId">): AuditEntry => ({
  id,
  sourceId: id,
  platform: "conduit",
  connectorId: "seed",
  ...e,
});

const mirrored = (id: string, e: Omit<AuditEntry, "id" | "sourceId" | "platform" | "connectorId">): AuditEntry => ({
  id,
  sourceId: id.replace("aud_", "cr_"),
  platform: "automation-anywhere",
  connectorId: "a360-prod",
  ...e,
});

export const auditEntries: AuditEntry[] = [
  native("aud_0001", { category: "governance", actor: "Luke Shiels", action: "enabled", target: "Require MFA", at: "3 weeks ago" }),
  mirrored("aud_0002", { category: "connector", actor: "Jonas Krause", action: "connected", target: "Prod Control Room", at: "2 weeks ago", detail: "Read-only mirror of the incumbent estate." }),
  native("aud_0003", { category: "lifecycle", actor: "Priya Fenn", action: "published", target: "Bulk invoice export v1", at: "5 days ago" }),
  mirrored("aud_0004", { category: "execution", actor: "Schedule · nightly", action: "started", target: "Claims keying", at: "3 days ago" }),
  native("aud_0005", { category: "governance", actor: "Jonas Krause", action: "approved", target: "Supplier detail check v1", at: "2 days ago", detail: "Hardened the mismatch path and tightened the assertion. Good to publish." }),
  native("aud_0006", { category: "lifecycle", actor: "Paulo Santos", action: "submitted for review", target: "Expense digest v1", at: "yesterday" }),
  native("aud_0007", { category: "governance", actor: "Luke Shiels", action: "requested changes on", target: "Expense digest v1", at: "4 hours ago", detail: "Narrow the query to the current period and handle the empty-result case." }),
  native("aud_0008", { category: "lifecycle", actor: "Priya Fenn", action: "submitted for review", target: "Search index rebuild v1", at: "2 hours ago" }),
  native("aud_0009", { category: "execution", actor: "Luke Shiels", action: "re-ran", target: "Password reset link audit", at: "1 minute ago", detail: "Re-run requested from incident #120." }),
];
