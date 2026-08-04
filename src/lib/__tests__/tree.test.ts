import { describe, expect, it } from "vitest";
import { narrowTree, rowAfter, rowMatching, visibleRows, type TreeRowInfo } from "../tree";
import type { LibraryTree } from "../library";
import { folders as seedFolders, workflows as seedWorkflows } from "../../data/workflows";
import { files as seedFiles } from "../../data/files";

const tree: LibraryTree = { folders: seedFolders, workflows: seedWorkflows, files: seedFiles };

const openAll = { expanded: () => true };
const openNone = { expanded: (id: string) => id.startsWith("vis:") };

const ids = (rows: TreeRowInfo[]) => rows.map((r) => r.id);
const rowFor = (rows: TreeRowInfo[], id: string) => rows.find((r) => r.id === id)!;

/** The name a row shows, for typeahead. */
const nameOf = (row: TreeRowInfo): string => {
  if (row.kind === "root") return row.id === "vis:public" ? "Public" : "Private";
  if (row.kind === "folder") return seedFolders.find((f) => f.id === row.id)?.name ?? "";
  if (row.kind === "workflow") return seedWorkflows.find((w) => w.id === row.id)?.name ?? "";
  return seedFiles.find((f) => f.id === row.id)?.name ?? "";
};

describe("visibleRows", () => {
  it("orders a folder's contents subfolders, then workflows, then files", () => {
    const rows = visibleRows(tree, openAll);
    const monitoring = rows.filter((r) => r.parentId === "pub-monitoring").map((r) => r.kind);
    expect(monitoring).toEqual(["folder", "file"]);

    const aa = rows.filter((r) => r.parentId === "pub-aa").map((r) => r.kind);
    // Ten mirrored workflows, then three files — never interleaved.
    expect(aa.indexOf("file")).toBe(aa.lastIndexOf("workflow") + 1);
  });

  it("starts with the two section headers and nests beneath them", () => {
    const rows = visibleRows(tree, openAll);
    expect(rows[0]).toMatchObject({ id: "vis:public", kind: "root", depth: 0, parentId: null });
    expect(rowFor(rows, "pub-root")).toMatchObject({ depth: 1, parentId: "vis:public" });
    expect(rowFor(rows, "pub-billing")).toMatchObject({ depth: 2, parentId: "pub-root" });
    expect(rowFor(rows, "pub-monitoring-synth")).toMatchObject({ depth: 3, parentId: "pub-monitoring" });
    expect(ids(rows)).toContain("vis:private");
  });

  it("omits what a collapsed branch holds, but still says it holds something", () => {
    const rows = visibleRows(tree, openNone);
    // Both roots open, their top folders visible, nothing below.
    expect(ids(rows)).toEqual(["vis:public", "pub-root", "vis:private", "prv-root"]);
    expect(rowFor(rows, "pub-root")).toMatchObject({ expandable: true, expanded: false });
  });

  it("marks an empty folder as not expandable", () => {
    const bare: LibraryTree = { folders: seedFolders, workflows: [], files: [] };
    const rows = visibleRows(bare, openAll);
    expect(rowFor(rows, "pub-billing")).toMatchObject({ expandable: false });
    expect(rowFor(rows, "pub-monitoring")).toMatchObject({ expandable: true }); // holds a subfolder
  });

  it("sorts sibling folders by name rather than by insertion", () => {
    const added = { ...tree, folders: [...seedFolders, { id: "fld_1", name: "Alerts", parentId: "pub-root", visibility: "public" as const }] };
    const under = visibleRows(added, openAll).filter((r) => r.parentId === "pub-root" && r.kind === "folder");
    expect(under[0].id).toBe("fld_1"); // "Alerts" sorts before "Automation Anywhere"
  });
});

describe("visibleRows, flat layout", () => {
  const flat = { ...openAll, layout: "list" as const };

  it("keeps the two estates and drops every folder row", () => {
    const rows = visibleRows(tree, flat);
    expect(rows.filter((r) => r.kind === "folder")).toEqual([]);
    expect(rows.filter((r) => r.kind === "root").map((r) => r.id)).toEqual(["vis:public", "vis:private"]);
  });

  it("hangs every leaf directly off its estate, one level down", () => {
    const rows = visibleRows(tree, flat);
    const leaves = rows.filter((r) => r.kind !== "root");
    expect(leaves.every((r) => r.depth === 1)).toBe(true);
    expect(new Set(leaves.map((r) => r.parentId))).toEqual(new Set(["vis:public", "vis:private"]));
  });

  it("files a leaf under the estate its folder belongs to", () => {
    const rows = visibleRows(tree, flat);
    const publicIds = new Set(rows.filter((r) => r.parentId === "vis:public").map((r) => r.id));
    const inPublic = (folderId: string) =>
      seedFolders.find((f) => f.id === folderId)?.visibility === "public";
    for (const w of seedWorkflows) expect(publicIds.has(w.id)).toBe(inPublic(w.folderId));
    for (const f of seedFiles) expect(publicIds.has(f.id)).toBe(inPublic(f.folderId));
  });

  it("shows everything, however deeply it was filed", () => {
    const rows = visibleRows(tree, flat);
    const ids_ = new Set(ids(rows));
    // Three levels down in the tree, top level here.
    expect(ids_.has(seedWorkflows.find((w) => w.folderId === "pub-monitoring-synth")!.id)).toBe(true);
    expect(rows.filter((r) => r.kind !== "root")).toHaveLength(seedWorkflows.length + seedFiles.length);
  });

  it("keeps workflows ahead of files, and each in the order it was given", () => {
    const rows = visibleRows(tree, flat).filter((r) => r.parentId === "vis:public");
    expect(rows.map((r) => r.kind).lastIndexOf("workflow")).toBe(rows.map((r) => r.kind).indexOf("file") - 1);
    // The workspace header's sort governs the incoming order; a flat list that
    // re-sorted would be the one place that control does nothing.
    const reversed = { ...tree, workflows: [...seedWorkflows].reverse() };
    const first = visibleRows(reversed, flat).find((r) => r.kind === "workflow");
    expect(first!.id).toBe([...seedWorkflows].reverse().find((w) => w.folderId.startsWith("pub"))!.id);
  });

  it("collapses to the two headers, and says whether they hold anything", () => {
    const rows = visibleRows(tree, { expanded: () => false, layout: "list" });
    expect(ids(rows)).toEqual(["vis:public", "vis:private"]);
    expect(rows.every((r) => r.expandable)).toBe(true);

    const bare = visibleRows({ ...tree, workflows: [], files: [] }, { expanded: () => false, layout: "list" });
    expect(bare.every((r) => !r.expandable)).toBe(true);
  });

  it("respects a search's slice, same as the tree does", () => {
    const one = seedWorkflows[0];
    const slice = { folders: new Set<string>(), workflows: new Set([one.id]), files: new Set<string>() };
    const rows = visibleRows(tree, { ...flat, slice });
    expect(rows.filter((r) => r.kind !== "root").map((r) => r.id)).toEqual([one.id]);
  });

  it("lists nothing whose folder has gone, rather than guessing an estate", () => {
    // A leaf pointing at a folder that isn't there belongs to neither estate; the
    // alternative — defaulting — files someone's work into the public tree.
    const orphaned = { ...tree, workflows: [...seedWorkflows, { ...seedWorkflows[0], id: "wf_orphan", folderId: "gone" }] };
    expect(ids(visibleRows(orphaned, flat))).not.toContain("wf_orphan");
  });
});

describe("narrowTree", () => {
  const empty = { folders: new Set<string>(), workflows: new Set<string>(), files: new Set<string>() };

  it("keeps every folder on the path down to a match", () => {
    const slice = narrowTree(tree, { ...empty, workflows: new Set(["wf_reset_audit"]) });
    // wf_reset_audit lives in Shared / Monitoring / Synthetics.
    expect([...slice.folders].sort()).toEqual(["pub-monitoring", "pub-monitoring-synth", "pub-root"]);
    expect(slice.workflows.has("wf_reset_audit")).toBe(true);
  });

  it("brings a name-matched folder's whole subtree with it", () => {
    const slice = narrowTree(tree, { ...empty, folders: new Set(["pub-monitoring"]) });
    expect(slice.folders.has("pub-monitoring-synth")).toBe(true);
    expect(slice.workflows.has("wf_reset_audit")).toBe(true);
    // And still keeps the ancestry above it.
    expect(slice.folders.has("pub-root")).toBe(true);
    // Without reaching into a sibling branch.
    expect(slice.folders.has("pub-billing")).toBe(false);
  });

  it("shows nothing when nothing matched", () => {
    const slice = narrowTree(tree, empty);
    expect(slice.folders.size + slice.workflows.size + slice.files.size).toBe(0);
  });

  it("renders as a tree, not a flat list, when handed to visibleRows", () => {
    const slice = narrowTree(tree, { ...empty, files: new Set(["fil_3"]) }); // synthetics.config.xml
    const rows = visibleRows(tree, { expanded: () => true, slice });
    expect(ids(rows)).toEqual([
      "vis:public",
      "pub-root",
      "pub-monitoring",
      "pub-monitoring-synth",
      "fil_3",
      "vis:private",
    ]);
  });
});

describe("cursor movement", () => {
  const rows = visibleRows(tree, openAll);

  it("steps to the next and previous row on screen", () => {
    expect(rowAfter(rows, "vis:public", 1)).toBe("pub-root");
    expect(rowAfter(rows, "pub-root", -1)).toBe("vis:public");
  });

  it("stops at the ends rather than wrapping", () => {
    expect(rowAfter(rows, rows[0].id, -1)).toBe(null);
    expect(rowAfter(rows, rows[rows.length - 1].id, 1)).toBe(null);
  });

  it("falls to the first row when the cursor points at something gone", () => {
    expect(rowAfter(rows, "deleted-id", 1)).toBe(rows[0].id);
  });

  it("jumps to the next row starting with a typed letter, wrapping past the end", () => {
    const from = rows[0].id;
    const hit = rowMatching(rows, from, "m", nameOf);
    expect(nameOf(rowFor(rows, hit!)).toLowerCase().startsWith("m")).toBe(true);
    // Wrapping: searching from the last row still finds an earlier match.
    const wrapped = rowMatching(rows, rows[rows.length - 1].id, "b", nameOf);
    expect(nameOf(rowFor(rows, wrapped!)).toLowerCase().startsWith("b")).toBe(true);
    expect(rowMatching(rows, from, "zzz", nameOf)).toBe(null);
  });
});
