import { describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE, isNarrowed, matchesQuery, passesFilter, type WorkspaceState } from "../workspace";
import { visibleIssues } from "../select";
import { issues } from "../../data/issues";
import { workspaceControls } from "../../data/workspaceControls";
import { menuEntries, optionsFor } from "../filterMenu";

const state = (patch: Partial<WorkspaceState> = {}): WorkspaceState => ({ ...EMPTY_WORKSPACE, ...patch });

describe("workspace control helpers", () => {
  it("matches a query against any field, case-insensitively", () => {
    expect(matchesQuery("reset", ["Broken password reset link", 120])).toBe(true);
    expect(matchesQuery("RESET", ["Broken password reset link"])).toBe(true);
    expect(matchesQuery("120", ["Broken password reset link", 120])).toBe(true);
    expect(matchesQuery("nope", ["Broken password reset link"])).toBe(false);
  });

  it("treats an empty query as no filter, and skips nullish fields", () => {
    expect(matchesQuery("", ["anything"])).toBe(true);
    expect(matchesQuery("  ", [null, undefined])).toBe(true);
    expect(matchesQuery("x", [null, undefined])).toBe(false);
  });

  it("passes a filter when it is unset or equal", () => {
    expect(passesFilter(state(), "status", "Active")).toBe(true);
    expect(passesFilter(state({ filters: { status: { op: "is", value: "Active" } } }), "status", "Active")).toBe(true);
    expect(passesFilter(state({ filters: { status: { op: "is", value: "Active" } } }), "status", "Resolved")).toBe(false);
  });

  it("inverts the match under \"is not\"", () => {
    const negated = state({ filters: { status: { op: "is not", value: "Active" } } });
    expect(passesFilter(negated, "status", "Active")).toBe(false);
    expect(passesFilter(negated, "status", "Resolved")).toBe(true);
  });

  it("reports whether a page is narrowed (sort alone is not narrowing)", () => {
    expect(isNarrowed(state())).toBe(false);
    expect(isNarrowed(state({ sort: "impact" }))).toBe(false);
    expect(isNarrowed(state({ query: "auth" }))).toBe(true);
    expect(isNarrowed(state({ filters: { status: { op: "is", value: "Active" } } }))).toBe(true);
  });
});

describe("visibleIssues (shared by the inbox list and the board)", () => {
  it("defaults to priority order, highest first", () => {
    const rows = visibleIssues(issues, state());
    const ranks = rows.map((i) => i.priority);
    expect(ranks).toEqual([...ranks].sort((a, b) => ["High", "Medium", "Low"].indexOf(a) - ["High", "Medium", "Low"].indexOf(b)));
  });

  it("sorts by impacted users and by newest", () => {
    const impact = visibleIssues(issues, state({ sort: "impact" }));
    expect(impact.map((i) => i.impactedUsers)).toEqual([...impact.map((i) => i.impactedUsers)].sort((a, b) => b - a));

    const newest = visibleIssues(issues, state({ sort: "id" }));
    expect(newest.map((i) => i.id)).toEqual([...newest.map((i) => i.id)].sort((a, b) => b - a));
  });

  it("narrows by search and stacks filters", () => {
    const searched = visibleIssues(issues, state({ query: "password" }));
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((i) => i.title.toLowerCase().includes("password"))).toBe(true);

    const active = visibleIssues(issues, state({ filters: { status: { op: "is", value: "Active" } } }));
    expect(active.every((i) => i.status === "Active")).toBe(true);

    const both = visibleIssues(issues, state({ filters: { status: { op: "is", value: "Active" }, priority: { op: "is", value: "High" } } }));
    expect(both.every((i) => i.status === "Active" && i.priority === "High")).toBe(true);
    expect(both.length).toBeLessThanOrEqual(active.length);
  });

  it("returns nothing when the filters exclude everything", () => {
    expect(visibleIssues(issues, state({ query: "no-such-issue-anywhere" }))).toEqual([]);
  });
});

describe("workspace control descriptors", () => {
  it("declares controls for the collection pages and none for settings", () => {
    expect(workspaceControls("inbox", "")?.search).toBeDefined();
    expect(workspaceControls("automations", "")?.filters?.length).toBeGreaterThan(0);
    expect(workspaceControls("settings", "")).toBeNull();
  });

  it("follows the active section tab", () => {
    // Activity's State filter only offers states the open tab can show.
    const inProgress = workspaceControls("activity", "In progress")?.filters?.find((f) => f.id === "state");
    expect(inProgress?.options.map((o) => o.id)).toEqual(["Running", "Queued"]);
    const historical = workspaceControls("activity", "Historical")?.filters?.find((f) => f.id === "state");
    expect(historical?.options.map((o) => o.id)).toEqual(["Completed", "Failed"]);
    // Insights is a report — no row order to choose.
    expect(workspaceControls("activity", "Insights")?.sorts).toBeUndefined();

    // Manage only offers the enabled/paused filter on the tabs that have it.
    expect(workspaceControls("manage", "Scheduled")?.filters?.length).toBe(1);
    expect(workspaceControls("manage", "Packages")?.filters).toBeUndefined();
  });

  it("gates page actions by role", () => {
    const invite = workspaceControls("administration", "Users")?.actions?.[0];
    expect(invite?.roles).toEqual(["admin"]);
    const newAutomation = workspaceControls("automations", "")?.actions?.[0];
    expect(newAutomation?.roles).toEqual(["admin", "developer"]);
  });
});

describe("the filter menu's type-ahead", () => {
  const inbox = workspaceControls("inbox", "")!;

  it("lists every dimension, then sorting, when nothing is typed", () => {
    const entries = menuEntries(inbox, "");
    expect(entries.filter((e) => e.kind === "field").map((e) => (e.kind === "field" ? e.field.id : ""))).toEqual([
      "status",
      "priority",
      "assignee",
    ]);
    expect(entries[entries.length - 1].kind).toBe("sort");
  });

  it("matches dimensions by name", () => {
    const entries = menuEntries(inbox, "prio");
    expect(entries.some((e) => e.kind === "field" && e.field.id === "priority")).toBe(true);
  });

  it("offers values directly, so a known value skips the second step", () => {
    const entries = menuEntries(inbox, "recovery");
    const value = entries.find((e) => e.kind === "value");
    expect(value).toBeDefined();
    if (value?.kind === "value") {
      expect(value.field.id).toBe("status");
      expect(value.option.id).toBe("In Recovery");
    }
  });

  it("finds sorting by its own name", () => {
    expect(menuEntries(inbox, "impacted").some((e) => e.kind === "sort")).toBe(true);
    expect(menuEntries(inbox, "zzz")).toEqual([]);
  });

  it("narrows a dimension's own options in the second step", () => {
    const status = inbox.filters!.find((f) => f.id === "status")!;
    expect(optionsFor(status, "res").map((o) => o.id)).toEqual(["Resolved"]);
    expect(optionsFor(status, "")).toHaveLength(status.options.length);
  });

  it("gives statuses and priorities the accent their rows use", () => {
    const status = inbox.filters!.find((f) => f.id === "status")!;
    expect(status.options.find((o) => o.id === "Active")?.accent).toBe("tomato");
    const priority = inbox.filters!.find((f) => f.id === "priority")!;
    expect(priority.options.find((o) => o.id === "High")?.accent).toBe("tomato");
  });
});
