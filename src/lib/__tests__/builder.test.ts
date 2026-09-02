import { describe, expect, it } from "vitest";
import {
  workflowId,
  blankDraft,
  commitDraft,
  draftProblems,
  moveStep,
  newStep,
  nextRunId,
  startedRun,
  runEventsToActivity,
  addStepTo,
  findStep,
  removeStep,
  updateStep,
} from "../builder";
import { paletteGroups } from "../builder";
import { EMPTY_WORKSPACE, type WorkspaceState } from "../workspace";
import { ACTIONS, actionById, flattenSteps, packagesForSteps, requirementsForSteps } from "../../data/actions";
import { CURRENT_SCHEMA_VERSION, latestVersion, publishedVersion, runnerFits } from "@conduit/domain";
import { workflows, runs } from "../../data/workflows";
import { runners } from "../../data/runners";
import { workspaceControls } from "../../data/workspaceControls";
import type { ActionStep, WorkflowDraft, WorkflowStep as WorkflowStepT } from "../../data/types";

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
    const step = newStep("browser.open", []) as ActionStep;
    expect(step.kind).toBe("action");
    expect(step.actionId).toBe("browser.open");
    // `choice` fields start on their first option.
    expect(step.config).toEqual({ engine: "Chromium", mode: "Headless" });
    // Text fields start on their placeholder, so a new step says something.
    expect((newStep("browser.goto", []) as ActionStep).config).toEqual({
      url: "https://app.conduit.com/…",
      timeout: "30",
    });
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
    const steps = [newStep("browser.open", []), newStep("browser.goto", [newStep("browser.open", [])])];
    const [first, second] = steps;
    expect(moveStep(steps, second.id, -1).map((s) => s.id)).toEqual([second.id, first.id]);
    expect(moveStep(steps, first.id, -1)).toBe(steps);
    expect(moveStep(steps, second.id, 1)).toBe(steps);
    expect(moveStep(steps, "nope", 1)).toBe(steps);
  });

  it("derives packages from the steps, deduped and in flow order", () => {
    const act = (actionId: string, id = actionId): ActionStep => ({ kind: "action", id, actionId, config: {} });
    expect(packagesForSteps([act("browser.open"), act("browser.goto"), act("metrics.record")])).toEqual([
      "browser",
      "metrics",
    ]);
    expect(packagesForSteps([act("not-an-action")])).toEqual([]);
  });
});

describe("saving a draft", () => {
  it("appends a new workflow with a readable id and derived packages", () => {
    const { workflows: next, id } = commitDraft(workflows, draftWith(), "Ada Lovelace");
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
    const { workflows: next, id } = commitDraft(workflows, edited, "Ada Lovelace");
    expect(id).toBe(existing.id);
    expect(next).toHaveLength(workflows.length);
    expect(next.find((a) => a.id === id)?.name).toBe("Renamed audit");
  });

  it("falls back to a title rather than saving an empty name", () => {
    const { workflows: next, id } = commitDraft(workflows, draftWith({ name: "   " }), "Ada Lovelace");
    expect(next.find((a) => a.id === id)?.name).toBe("Untitled workflow");
  });
});

describe("starting a run", () => {
  it("continues the run numbering", () => {
    expect(nextRunId([{ id: "run_1045" }, { id: "run_1002" }] as never)).toBe("run_1046");
    expect(nextRunId([])).toBe("run_1001");
  });

  it("starts queued, manually triggered, carrying the placement and nothing else", () => {
    const workflow = workflows[0];
    const run = startedRun(workflow, "Ada Lovelace", runs, runners);
    expect(run).toMatchObject({ state: "Queued", trigger: "Manual", startedBy: "Ada Lovelace", startedAt: "just now" });
    expect(run.workflowId).toBe(workflow.id);
    // Exactly one line: where it is going, and why. Everything else in the log is
    // reported by the engine as it happens — nothing here has happened yet, and the
    // step-by-step log this used to fabricate was a description of the flow, not of
    // a run.
    expect(run.activity).toHaveLength(1);
  });

  it("places the run through the distributor and records why", () => {
    const workflow = workflows[0];
    const run = startedRun(workflow, "Ada Lovelace", runs, runners);
    const placed = runners.find((r) => r.id === run.runnerId);
    expect(placed).toBeDefined();
    // The reason is on the log, not just the placement — a choice nobody can read
    // is the same bottleneck in a different place.
    expect(run.activity[0].title).toContain(placed!.name);
  });

  it("names no runner when the pool can't take the work", () => {
    const headedOnly = { ...workflows[0], requirements: { auth: "none", ui: "headed", platform: "windows" } as const };
    const run = startedRun(headedOnly, "Ada Lovelace", runs, []);
    expect(run.runnerId).toBeUndefined();
    expect(run.activity[0].title).toContain("Waiting for a runner");
  });
});

describe("run events, rendered", () => {
  const event = (sequence: number, kind: "started" | "step-finished" | "failed", message: string) => ({
    runId: "run_x",
    sequence,
    kind,
    message,
    at: new Date().toISOString(),
  });

  it("maps each protocol kind onto the timeline's vocabulary", () => {
    const rendered = runEventsToActivity([
      event(1, "started", "Run started"),
      event(2, "step-finished", "GET https://api.test → 200"),
      event(3, "failed", "Run failed — expected 200, got 500"),
    ]);
    expect(rendered.map((a) => a.kind)).toEqual(["status", "fact", "problem"]);
    expect(rendered.map((a) => a.id)).toEqual(["run_x-1", "run_x-2", "run_x-3"]);
  });

  it("turns the runner's ISO clock into the labels every other surface reads", () => {
    // The runner stamps ISO because that is the only sane thing to send between
    // machines; the timeline reads "just now" / "4 min ago" everywhere else.
    expect(runEventsToActivity([event(1, "started", "Run started")])[0].time).toBe("just now");
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
      for (const step of flattenSteps(workflow.steps)) expect(actionById(step.actionId), `${workflow.id}/${step.id}`).toBeDefined();
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
      for (const step of flattenSteps(workflow.steps)) {
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

describe("version history", () => {
  it("cuts v1 on first save and appends on every edit", () => {
    const { workflows: afterNew, id } = commitDraft(workflows, draftWith(), "Ada Lovelace");
    const created = afterNew.find((w) => w.id === id)!;
    expect(created.versions.map((v) => v.version)).toEqual([1]);
    expect(created.versions[0].authoredBy).toBe("Ada Lovelace");

    const edited = commitDraft(afterNew, { ...created, isNew: false, name: "Renamed" }, "Priya Fenn");
    expect(edited.workflows.find((w) => w.id === id)!.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("never mutates an approved version in place", () => {
    // Editing after approval must produce a new version, or the approval silently
    // comes to cover text nobody read.
    const approved = workflows.find((w) => w.status === "Approved")!;
    const before = approved.versions.find((v) => v.approvedBy !== undefined)!;
    const { workflows: after } = commitDraft(workflows, { ...approved, isNew: false }, "Paulo Santos");
    const now = after.find((w) => w.id === approved.id)!;
    expect(now.versions.length).toBe(approved.versions.length + 1);
    expect(now.versions.find((v) => v.version === before.version)).toEqual(before);
    expect(latestVersion(now.versions)!.approvedBy).toBeUndefined();
  });

  it("gives every seeded workflow a history its status could have produced", () => {
    for (const w of workflows) {
      expect(w.versions.length, w.id).toBeGreaterThan(0);
      expect(w.schemaVersion, w.id).toBe(CURRENT_SCHEMA_VERSION);
      // A published workflow always carries an approval — there is no transition
      // that reaches Published without one.
      if (w.status === "Published" || w.status === "Paused") {
        expect(publishedVersion(w.versions)?.approvedBy, w.id).toBeTruthy();
      }
    }
  });
});

describe("conditionals", () => {
  const branch = (id: string, thenArm: WorkflowStepT[] = [], elseArm: WorkflowStepT[] = []): WorkflowStepT => ({
    kind: "branch",
    id,
    condition: "{{ response.status }} == 200",
    then: thenArm,
    else: elseArm,
  });

  it("derives packages and requirements from inside both arms", () => {
    // A package used only on the unhappy path is still a dependency, and a headed
    // step inside an `else` still makes the flow headed — placement happens before
    // anyone knows which way it goes.
    const flow = [
      newStep("http.request", []),
      branch("b1", [newStep("storage.put", [])], [newStep("browser.open", [])]),
    ];
    expect(packagesForSteps(flow)).toContain("storage-s3");
    expect(packagesForSteps(flow)).toContain("browser");
    expect(requirementsForSteps(flow).auth).toBe("managed-identity");
  });

  it("makes the flow headed when a headed step hides in an arm", () => {
    const headedInside = branch("b1", [], [{ kind: "action", id: "s9", actionId: "browser.open", config: { mode: "Headed" } }]);
    expect(requirementsForSteps([headedInside]).ui).toBe("headed");
  });

  it("keeps step ids unique across the whole tree", () => {
    // A duplicate id inside an `else` would make selection ambiguous.
    const flow = [branch("stp_1", [{ kind: "action", id: "stp_2", actionId: "http.request", config: {} }])];
    const fresh = newStep("metrics.record", flow);
    expect(["stp_1", "stp_2"]).not.toContain(fresh.id);
  });

  it("moves a step within its own arm and never across a boundary", () => {
    const a = { kind: "action", id: "a", actionId: "http.request", config: {} } as WorkflowStepT;
    const b = { kind: "action", id: "b", actionId: "metrics.record", config: {} } as WorkflowStepT;
    const flow = [branch("b1", [a, b])];
    const moved = moveStep(flow, "b", -1);
    const arm = (moved[0] as { then: WorkflowStepT[] }).then;
    expect(arm.map((s) => s.id)).toEqual(["b", "a"]);
    // Moving the first step of an arm up does nothing — it does not escape the branch.
    expect(moveStep(flow, "a", -1)).toBe(flow);
  });

  it("edits and removes a step nested in an arm", () => {
    const flow = [branch("b1", [{ kind: "action", id: "s1", actionId: "http.request", config: { method: "GET" } }])];
    const edited = updateStep(flow, "s1", (s) => (s.kind === "action" ? { ...s, config: { method: "POST" } } : s));
    expect(((edited[0] as { then: WorkflowStepT[] }).then[0] as ActionStep).config.method).toBe("POST");
    expect((removeStep(flow, "s1")[0] as { then: WorkflowStepT[] }).then).toEqual([]);
  });

  it("removing a branch takes its arms with it", () => {
    const flow = [branch("b1", [newStep("http.request", [])]), newStep("metrics.record", [])];
    const after = removeStep(flow, "b1");
    expect(after).toHaveLength(1);
    expect(flattenSteps(after).map((s) => s.actionId)).toEqual(["metrics.record"]);
  });

  it("adds a step into the arm it was aimed at", () => {
    const flow = [branch("b1")];
    const added = addStepTo(flow, { branchId: "b1", arm: "else" }, newStep("email.send", flow));
    expect((added[0] as { else: WorkflowStepT[] }).else).toHaveLength(1);
    expect((added[0] as { then: WorkflowStepT[] }).then).toHaveLength(0);
  });

  it("finds a step however deep it is", () => {
    const flow = [branch("b1", [branch("b2", [{ kind: "action", id: "deep", actionId: "http.request", config: {} }])])];
    expect(findStep(flow, "deep")?.id).toBe("deep");
    expect(findStep(flow, "nope")).toBeUndefined();
  });

});
