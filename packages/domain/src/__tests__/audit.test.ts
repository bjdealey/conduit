import { describe, expect, it } from "vitest";
import { REVIEW_ACTIONS } from "../review.ts";
import {
  AUDIT_CATEGORIES,
  REVIEW_ACTION_VERB,
  auditByCategory,
  categoryOfReviewAction,
  orderAudit,
  type AuditEntry,
} from "../audit.ts";

const entry = (id: string, patch: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  sourceId: id,
  platform: "conduit",
  connectorId: "seed",
  category: "governance",
  actor: "Luke Shiels",
  action: "approved",
  target: "Expense digest",
  at: "just now",
  ...patch,
});

describe("audit categories", () => {
  it("gives every review action a category and a past-tense verb", () => {
    for (const action of REVIEW_ACTIONS) {
      expect(AUDIT_CATEGORIES).toContain(categoryOfReviewAction(action));
      expect(REVIEW_ACTION_VERB[action], action).toBeTruthy();
    }
  });

  it("treats approving and publishing as governance, not routine lifecycle", () => {
    // These are the moves someone will be asked to account for later.
    expect(categoryOfReviewAction("approve")).toBe("governance");
    expect(categoryOfReviewAction("publish")).toBe("governance");
    // Withdrawing is an author tidying up after themselves.
    expect(categoryOfReviewAction("withdraw")).toBe("lifecycle");
  });
});

describe("ordering", () => {
  it("reads newest first", () => {
    const out = orderAudit([entry("aud_001"), entry("aud_003"), entry("aud_002")]);
    expect(out.map((e) => e.id)).toEqual(["aud_003", "aud_002", "aud_001"]);
  });

  it("is stable across repeated calls", () => {
    // An audit trail that appears to reorder itself between renders reads as
    // tampering, in the one surface where it must not.
    const input = [entry("aud_002"), entry("aud_001"), entry("aud_003")];
    expect(orderAudit(input)).toEqual(orderAudit(input));
  });

  it("does not mutate its input", () => {
    const input = [entry("aud_001"), entry("aud_002")];
    orderAudit(input);
    expect(input.map((e) => e.id)).toEqual(["aud_001", "aud_002"]);
  });

  it("filters by category and keeps the order", () => {
    const out = auditByCategory(
      [entry("aud_001"), entry("aud_002", { category: "execution" }), entry("aud_003")],
      "governance",
    );
    expect(out.map((e) => e.id)).toEqual(["aud_003", "aud_001"]);
  });

  it("handles an empty trail", () => {
    expect(orderAudit([])).toEqual([]);
    expect(auditByCategory([], "governance")).toEqual([]);
  });
});
