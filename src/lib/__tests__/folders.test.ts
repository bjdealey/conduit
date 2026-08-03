import { describe, expect, it } from "vitest";
import { childFolders, folderPath, folderTrail, subtreeIds, workflowsUnder } from "../folders";
import { folders, workflows } from "../../data/workflows";
import type { Folder, Workflow } from "../../data/types";

/** A cyclic tree — the shape a bad edit or a bad sync row could produce. */
const cyclic: Folder[] = [
  { id: "a", name: "A", parentId: "b", visibility: "public" },
  { id: "b", name: "B", parentId: "a", visibility: "public" },
];

const workflowIn = (id: string, folderId: string): Workflow =>
  ({ id, folderId, runCount: 0 }) as unknown as Workflow;

describe("folder tree helpers", () => {
  it("lists the direct children of a folder", () => {
    expect(childFolders(folders, "pub-monitoring").map((f) => f.id)).toEqual(["pub-monitoring-synth"]);
    expect(childFolders(folders, "pub-monitoring-synth")).toEqual([]);
  });

  it("lists one visibility tree's roots when asked for the top level", () => {
    expect(childFolders(folders, null, "public").map((f) => f.id)).toEqual(["pub-root"]);
    expect(childFolders(folders, null, "private").map((f) => f.id)).toEqual(["prv-root"]);
    // Without a visibility, the top level is every root, both trees — by name, so
    // "My workflows" precedes "Shared" whatever order the seed happens to list.
    expect(childFolders(folders, null).map((f) => f.name)).toEqual(["My workflows", "Shared"]);
  });

  it("sorts siblings by name rather than by insertion order", () => {
    const added = [...folders, { id: "fld_1", name: "Alerts", parentId: "pub-root", visibility: "public" as const }];
    expect(childFolders(added, "pub-root").map((f) => f.name)).toEqual([
      "Alerts",
      "Automation Anywhere",
      "Billing",
      "Monitoring",
      "Onboarding",
    ]);
  });

  it("walks ancestry outermost-first, and renders it as a path", () => {
    expect(folderTrail(folders, "pub-monitoring-synth").map((f) => f.id)).toEqual([
      "pub-root",
      "pub-monitoring",
      "pub-monitoring-synth",
    ]);
    expect(folderPath(folders, "pub-monitoring-synth")).toBe("Shared / Monitoring / Synthetics");
    expect(folderPath(folders, "pub-root")).toBe("Shared");
  });

  it("returns nothing for an unknown folder rather than throwing", () => {
    expect(folderTrail(folders, "nope")).toEqual([]);
    expect(folderPath(folders, "nope")).toBe("");
  });

  it("collects a folder and everything beneath it", () => {
    expect(subtreeIds(folders, "pub-monitoring")).toEqual(["pub-monitoring", "pub-monitoring-synth"]);
    expect(subtreeIds(folders, "pub-root")).toContain("pub-monitoring-synth");
    // An unknown id yields only itself — a caller filtering on it finds nothing,
    // never everything.
    expect(subtreeIds(folders, "nope")).toEqual(["nope"]);
  });

  it("terminates on a cyclic parent chain instead of hanging", () => {
    expect(folderTrail(cyclic, "a").map((f) => f.id)).toEqual(["b", "a"]);
    expect(subtreeIds(cyclic, "a")).toEqual(["a", "b"]);
  });

  it("counts workflows in the whole subtree, not just the direct contents", () => {
    const nested: Workflow[] = [workflowIn("wf_1", "pub-monitoring"), workflowIn("wf_2", "pub-monitoring-synth")];
    expect(workflowsUnder(nested, folders, "pub-monitoring").map((w) => w.id)).toEqual(["wf_1", "wf_2"]);
    expect(workflowsUnder(nested, folders, "pub-monitoring-synth").map((w) => w.id)).toEqual(["wf_2"]);
    expect(workflowsUnder(nested, folders, "pub-billing")).toEqual([]);
  });

  it("accounts for every seeded workflow under one of the two roots", () => {
    const rooted = ["pub-root", "prv-root"].flatMap((id) => workflowsUnder(workflows, folders, id));
    expect(rooted).toHaveLength(workflows.length);
  });
});
