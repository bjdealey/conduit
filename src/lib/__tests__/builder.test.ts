import { describe, expect, it } from "vitest";
import {
  automationId,
  blankDraft,
  commitDraft,
  draftProblems,
  moveStep,
  newStep,
  nextRunId,
  testRun,
} from "../builder";
import { ACTIONS, actionById, packagesForSteps } from "../../data/actions";
import { automations, runs } from "../../data/automations";
import type { AutomationDraft } from "../../data/types";

const draftWith = (patch: Partial<AutomationDraft> = {}): AutomationDraft => ({
  ...blankDraft("ls", "prv-drafts"),
  name: "Nightly export",
  steps: [newStep("records.query", []), newStep("pdf.render", [])],
  ...patch,
});

describe("starting a draft", () => {
  it("starts private, as a Draft, with nothing in it", () => {
    const draft = blankDraft("ls", "prv-drafts");
    expect(draft).toMatchObject({ isNew: true, status: "Draft", visibility: "private", ownerId: "ls", steps: [] });
    expect(draft.name).toBe("");
  });

  it("asks for a name and at least one step before it can be saved", () => {
    expect(draftProblems(blankDraft("ls", "prv-drafts"))).toHaveLength(2);
    expect(draftProblems(draftWith({ name: "  " }))).toEqual(["Give the automation a name."]);
    expect(draftProblems(draftWith({ steps: [] }))).toEqual(["Add at least one step."]);
    expect(draftProblems(draftWith())).toEqual([]);
  });
});

describe("editing the flow", () => {
  it("adds a step ready to read, not blank", () => {
    const step = newStep("browser.open", []);
    expect(step.actionId).toBe("browser.open");
    // `choice` fields start on their first option.
    expect(step.config).toEqual({ engine: "Chromium", mode: "Headless" });
    // Text fields start on their placeholder, so a new step says something.
    expect(newStep("browser.goto", []).config).toEqual({ url: "https://app.conduit.com/…", timeout: "30" });
  });

  it("keeps step ids unique within a flow", () => {
    const a = newStep("browser.open", []);
    const b = newStep("browser.goto", [a]);
    const c = newStep("browser.click", [a, b]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    // Ids stay unique after a removal in the middle.
    const d = newStep("email.send", [a, c]);
    expect([a.id, c.id]).not.toContain(d.id);
  });

  it("moves a step within the flow and ignores moves off either end", () => {
    const steps = [newStep("browser.open", []), newStep("browser.goto", [{ id: "stp_1" } as never])];
    const [first, second] = steps;
    expect(moveStep(steps, second.id, -1).map((s) => s.id)).toEqual([second.id, first.id]);
    expect(moveStep(steps, first.id, -1)).toBe(steps);
    expect(moveStep(steps, second.id, 1)).toBe(steps);
    expect(moveStep(steps, "nope", 1)).toBe(steps);
  });

  it("derives packages from the steps, deduped and in flow order", () => {
    expect(packagesForSteps([{ actionId: "browser.open" }, { actionId: "browser.goto" }, { actionId: "metrics.record" }]))
      .toEqual(["browser", "metrics"]);
    expect(packagesForSteps([{ actionId: "not-an-action" }])).toEqual([]);
  });
});

describe("saving a draft", () => {
  it("appends a new automation with a readable id and derived packages", () => {
    const { automations: next, id } = commitDraft(automations, draftWith());
    expect(id).toBe("aut_nightly_export");
    expect(next).toHaveLength(automations.length + 1);
    const saved = next.find((a) => a.id === id)!;
    expect(saved.packages).toEqual(["billing-api", "pdf"]);
    expect(saved.updatedAgo).toBe("just now");
  });

  it("never collides with an existing id", () => {
    expect(automationId("Bulk invoice export", ["aut_bulk_invoice_export"])).toBe("aut_bulk_invoice_export_2");
    expect(automationId("!!!", [])).toBe("aut_automation");
  });

  it("replaces in place when editing an existing automation", () => {
    const existing = automations[0];
    const edited: AutomationDraft = { ...existing, isNew: false, name: "Renamed audit" };
    const { automations: next, id } = commitDraft(automations, edited);
    expect(id).toBe(existing.id);
    expect(next).toHaveLength(automations.length);
    expect(next.find((a) => a.id === id)?.name).toBe("Renamed audit");
  });

  it("falls back to a title rather than saving an empty name", () => {
    const { automations: next, id } = commitDraft(automations, draftWith({ name: "   " }));
    expect(next.find((a) => a.id === id)?.name).toBe("Untitled automation");
  });
});

describe("test runs", () => {
  it("continues the run numbering", () => {
    expect(nextRunId([{ id: "run_1045" }, { id: "run_1002" }] as never)).toBe("run_1046");
    expect(nextRunId([])).toBe("run_1001");
  });

  it("starts in flight, manually triggered, with a log that walks the flow", () => {
    const automation = automations[0];
    const run = testRun(automation, "Keith Kennedy", runs);
    expect(run).toMatchObject({ state: "Running", trigger: "Manual", startedBy: "Keith Kennedy", startedAt: "just now" });
    expect(run.automationId).toBe(automation.id);
    // One log line per step, after the "started" line.
    expect(run.activity).toHaveLength(automation.steps.length + 1);
    expect(run.activity[1].title).toBe(`1. ${actionById(automation.steps[0].actionId)?.label}`);
  });
});

describe("the action palette", () => {
  it("gives every action a package that a seeded automation could depend on", () => {
    for (const action of ACTIONS) {
      expect(action.package, action.id).toMatch(/^[a-z0-9-]+$/);
      expect(action.fields.length, action.id).toBeGreaterThan(0);
    }
  });

  it("resolves every step in the seed library to a real action", () => {
    for (const automation of automations) {
      expect(automation.steps.length, automation.id).toBeGreaterThan(0);
      for (const step of automation.steps) expect(actionById(step.actionId), `${automation.id}/${step.id}`).toBeDefined();
      // The declared dependencies match what the flow actually uses.
      expect(automation.packages, automation.id).toEqual(packagesForSteps(automation.steps));
    }
  });

  it("uses field ids that the seeded configs actually set", () => {
    for (const automation of automations) {
      for (const step of automation.steps) {
        const fields = new Set(actionById(step.actionId)!.fields.map((f) => f.id));
        for (const key of Object.keys(step.config)) expect(fields, `${step.actionId}.${key}`).toContain(key);
      }
    }
  });
});
