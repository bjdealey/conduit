import { describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE, isNarrowed, matchesQuery, passesFilter, type WorkspaceState } from "../workspace";
import { visibleIssues } from "../select";
import { issues } from "../../data/issues";
import { workspaceControls } from "../../data/workspaceControls";

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
    expect(passesFilter(state({ filters: { status: "Active" } }), "status", "Active")).toBe(true);
    expect(passesFilter(state({ filters: { status: "Active" } }), "status", "Resolved")).toBe(false);
  });

  it("reports whether a page is narrowed (sort alone is not narrowing)", () => {
    expect(isNarrowed(state())).toBe(false);
    expect(isNarrowed(state({ sort: "impact" }))).toBe(false);
    expect(isNarrowed(state({ query: "auth" }))).toBe(true);
    expect(isNarrowed(state({ filters: { status: "Active" } }))).toBe(true);
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

    const active = visibleIssues(issues, state({ filters: { status: "Active" } }));
    expect(active.every((i) => i.status === "Active")).toBe(true);

    const both = visibleIssues(issues, state({ filters: { status: "Active", priority: "High" } }));
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
