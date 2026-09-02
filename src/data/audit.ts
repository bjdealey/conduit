/**
 * Seed audit trail.
 *
 * Every entry here is native, because this sample estate is native. The trail is
 * still `SourceStamped` and still carries `platform`/`connectorId` on every row —
 * that is the whole design: one trail covers every estate, and an action mirrored
 * in by a connector sits beside a native approval, distinguished only by `platform`.
 * Nothing about the surface changes when the first connector arrives; the rows just
 * stop all saying `conduit`.
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

export const auditEntries: AuditEntry[] = [
  native("aud_0001", { category: "governance", actor: "Luke Shiels", action: "enabled", target: "Require MFA", at: "3 weeks ago" }),
  native("aud_0003", { category: "lifecycle", actor: "Priya Fenn", action: "published", target: "Bulk invoice export v1", at: "5 days ago" }),
  native("aud_0005", { category: "governance", actor: "Jonas Krause", action: "approved", target: "Supplier detail check v1", at: "2 days ago", detail: "Hardened the mismatch path and tightened the assertion. Good to publish." }),
  native("aud_0006", { category: "lifecycle", actor: "Paulo Santos", action: "submitted for review", target: "Expense digest v1", at: "yesterday" }),
  native("aud_0007", { category: "governance", actor: "Luke Shiels", action: "requested changes on", target: "Expense digest v1", at: "4 hours ago", detail: "Narrow the query to the current period and handle the empty-result case." }),
  native("aud_0008", { category: "lifecycle", actor: "Priya Fenn", action: "submitted for review", target: "Search index rebuild v1", at: "2 hours ago" }),
  native("aud_0009", { category: "execution", actor: "Luke Shiels", action: "re-ran", target: "Password reset link audit", at: "1 minute ago", detail: "Re-run requested from incident #120." }),
];
