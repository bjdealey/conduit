import { describe, expect, it } from "vitest";
import {
  workflowId,
  blankDraft,
  commitDraft,
  draftProblems,
  moveStep,
  newStep,
  nextRunId,
  testRun,
} from "../builder";
import { paletteGroups } from "../builder";
import { EMPTY_WORKSPACE, type WorkspaceState } from "../workspace";
import { ACTIONS, actionById, packagesForSteps, requirementsForSteps } from "../../data/actions";
import { runnerFits } from "@conduit/domain";
import { workflows, runs } from "../../data/workflows";
import { runners } from "../../data/runners";
import { workspaceControls } from "../../data/workspaceControls";
import type { WorkflowDraft } from "../../data/types";

const controls = (patch: Partial<WorkspaceState> = {}): WorkspaceState => ({ ...EMPTY_WORKSPACE, ...patch });

const draftWith = (patch: Partial<WorkflowDraft> = {}): WorkflowDraft => ({
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
    expect(draftProblems(draftWith({ name: "  " }))).toEqual(["Give the workflow a name."]);
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
  it("appends a new workflow with a readable id and derived packages", () => {
    const { workflows: next, id } = commitDraft(workflows, draftWith());
    expect(id).toBe("wf_nightly_export");
    expect(next).toHaveLength(workflows.length + 1);
    const saved = next.find((a) => a.id === id)!;
    expect(saved.packages).toEqual(["billing-api", "pdf"]);
    expect(saved.updatedAgo).toBe("just now");
  });

  it("never collides with an existing id", () => {
    expect(workflowId("Bulk invoice export", ["wf_bulk_invoice_export"])).toBe("wf_bulk_invoice_export_2");
    expect(workflowId("!!!", [])).toBe("wf_workflow");
  });

  it("replaces in place when editing an existing workflow", () => {
    const existing = workflows[0];
    const edited: WorkflowDraft = { ...existing, isNew: false, name: "Renamed audit" };
    const { workflows: next, id } = commitDraft(workflows, edited);
    expect(id).toBe(existing.id);
    expect(next).toHaveLength(workflows.length);
    expect(next.find((a) => a.id === id)?.name).toBe("Renamed audit");
  });

  it("falls back to a title rather than saving an empty name", () => {
    const { workflows: next, id } = commitDraft(workflows, draftWith({ name: "   " }));
    expect(next.find((a) => a.id === id)?.name).toBe("Untitled workflow");
  });
});

describe("test runs", () => {
  it("continues the run numbering", () => {
    expect(nextRunId([{ id: "run_1045" }, { id: "run_1002" }] as never)).toBe("run_1046");
    expect(nextRunId([])).toBe("run_1001");
  });

  it("starts in flight, manually triggered, with a log that walks the flow", () => {
    const workflow = workflows[0];
    const run = testRun(workflow, "Keith Kennedy", runs, runners);
    expect(run).toMatchObject({ state: "Running", trigger: "Manual", startedBy: "Keith Kennedy", startedAt: "just now" });
    expect(run.workflowId).toBe(workflow.id);
    // One log line per step, after the "started" and placement lines.
    expect(run.activity).toHaveLength(workflow.steps.length + 2);
    expect(run.activity[2].title).toBe(`1. ${actionById(workflow.steps[0].actionId)?.label}`);
  });

  it("places the run through the distributor and records why", () => {
    const workflow = workflows[0];
    const run = testRun(workflow, "Keith Kennedy", runs, runners);
    const placed = runners.find((r) => r.id === run.runnerId);
    expect(placed).toBeDefined();
    // The reason is on the log, not just the placement — a choice nobody can read
    // is the same bottleneck in a different place.
    expect(run.activity[1].body).toBeTruthy();
  });

  it("queues rather than inventing a runner when the pool can't take the work", () => {
    const headedOnly = { ...workflows[0], requirements: { auth: "none", ui: "headed", platform: "windows" } as const };
    const run = testRun(headedOnly, "Keith Kennedy", runs, []);
    expect(run.state).toBe("Queued");
    expect(run.runnerId).toBeUndefined();
  });
});

describe("the action palette", () => {
  it("gives every action a package that a seeded workflow could depend on", () => {
    for (const action of ACTIONS) {
      expect(action.package, action.id).toMatch(/^[a-z0-9-]+$/);
      expect(action.fields.length, action.id).toBeGreaterThan(0);
    }
  });

  it("resolves every step in the seed library to a real action", () => {
    // Only natively-authored flows have steps to resolve. A mirrored workflow's
    // flow lives on its own platform, and inventing steps for it here would be the
    // one lie that makes the whole estate view untrustworthy.
    for (const workflow of workflows.filter((a) => a.platform === "conduit")) {
      expect(workflow.steps.length, workflow.id).toBeGreaterThan(0);
      for (const step of workflow.steps) expect(actionById(step.actionId), `${workflow.id}/${step.id}`).toBeDefined();
      // The declared dependencies match what the flow actually uses.
      expect(workflow.packages, workflow.id).toEqual(packagesForSteps(workflow.steps));
    }
  });

  it("keeps mirrored workflows empty — they are reflections, not authored flows", () => {
    for (const workflow of workflows.filter((a) => a.platform !== "conduit")) {
      expect(workflow.steps, workflow.id).toEqual([]);
      expect(workflow.packages, workflow.id).toEqual([]);
    }
  });

  it("declares requirements no weaker than its steps demand", () => {
    // The floor is derived, so an author can ask for more than the flow needs but
    // never for less — otherwise a headed step lands on a runner with no session.
    for (const workflow of workflows) {
      const derived = requirementsForSteps(workflow.steps);
      if (derived.ui === "headed") expect(workflow.requirements.ui, workflow.id).toBe("headed");
      if (derived.platform === "windows") expect(workflow.requirements.platform, workflow.id).toBe("windows");
    }
  });

  it("places every seeded run on a runner that could actually carry it", () => {
    for (const run of runs) {
      if (!run.runnerId) continue;
      const runner = runners.find((r) => r.id === run.runnerId);
      expect(runner, run.id).toBeDefined();
      const workflow = workflows.find((a) => a.id === run.workflowId)!;
      expect(runnerFits(runner!, workflow.requirements), `${run.id} on ${run.runnerId}`).toBe(true);
    }
  });

  it("uses field ids that the seeded configs actually set", () => {
    for (const workflow of workflows) {
      for (const step of workflow.steps) {
        const fields = new Set(actionById(step.actionId)!.fields.map((f) => f.id));
        for (const key of Object.keys(step.config)) expect(fields, `${step.actionId}.${key}`).toContain(key);
      }
    }
  });
});

describe("the palette under the workspace header", () => {
  it("groups by package by default, with every action present", () => {
    const groups = paletteGroups(controls());
    expect(groups.every((g) => g.package !== null)).toBe(true);
    expect(groups.flatMap((g) => g.actions)).toHaveLength(ACTIONS.length);
  });

  it("searches label, package, and summary", () => {
    expect(paletteGroups(controls({ query: "browser" })).flatMap((g) => g.actions.map((a) => a.id))).toContain(
      "browser.open",
    );
    // Matched on the summary rather than the label.
    expect(paletteGroups(controls({ query: "object storage" })).flatMap((g) => g.actions.map((a) => a.id))).toEqual([
      "storage.put",
    ]);
    expect(paletteGroups(controls({ query: "nothing-matches-this" }))).toEqual([]);
  });

  it("keeps one package when the filter is set", () => {
    const groups = paletteGroups(controls({ filters: { package: { op: "is", value: "assertions" } } }));
    expect(groups).toHaveLength(1);
    expect(groups[0].package).toBe("assertions");
  });

  it("flattens to one alphabetical list when sorted by name", () => {
    const groups = paletteGroups(controls({ sort: "name" }));
    expect(groups).toHaveLength(1);
    expect(groups[0].package).toBeNull();
    const labels = groups[0].actions.map((a) => a.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("stacks the search with the filter", () => {
    const groups = paletteGroups(controls({ query: "assert", filters: { package: { op: "is", value: "browser" } } }));
    expect(groups).toEqual([]);
  });
});

describe("the builder's chrome", () => {
  it("declares the same controls every other page gets", () => {
    const definition = workspaceControls("builder", "");
    expect(definition?.search).toBe("Search or filter actions…");
    expect(definition?.filters?.[0].id).toBe("package");
    expect(definition?.sorts?.map((s) => s.id)).toEqual(["package", "name"]);
  });

  it("offers every package the palette actually provides", () => {
    const offered = workspaceControls("builder", "")?.filters?.[0].options.map((o) => o.id) ?? [];
    expect(new Set(offered)).toEqual(new Set(ACTIONS.map((a) => a.package)));
  });
});
