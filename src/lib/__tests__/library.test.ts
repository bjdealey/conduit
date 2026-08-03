import { describe, expect, it } from "vitest";
import {
  countUnder,
  createFile,
  createFolder,
  deleteNode,
  extensionOf,
  freeName,
  kindOfFile,
  moveNode,
  moveTargets,
  nextId,
  renameNode,
  type LibraryNode,
  type LibraryTree,
} from "../library";
import { folders as seedFolders, workflows as seedWorkflows } from "../../data/workflows";
import { files as seedFiles } from "../../data/files";
import { subtreeIds } from "../folders";

const tree = (): LibraryTree => ({ folders: seedFolders, workflows: seedWorkflows, files: seedFiles });

/** The reason a refusal carried, or "" when the edit went through. */
const reasonOf = (r: ReturnType<typeof renameNode>) => (r.ok ? "" : r.reason);
/** The tree an edit produced — fails loudly rather than silently returning the input. */
const treeOf = (r: ReturnType<typeof renameNode>): LibraryTree => {
  if (!r.ok) throw new Error(`expected the edit to succeed, was refused: ${r.reason}`);
  return r.tree;
};

const folder = (id: string): LibraryNode => ({ kind: "folder", id });
const workflow = (id: string): LibraryNode => ({ kind: "workflow", id });
const file = (id: string): LibraryNode => ({ kind: "file", id });

/** A native workflow and a mirrored one from the seed. */
const native = seedWorkflows.find((w) => w.platform === "conduit")!;
const mirrored = seedWorkflows.find((w) => w.platform !== "conduit")!;

describe("file kinds", () => {
  it("reads the kind from the extension", () => {
    expect(kindOfFile("billing-rules.xml")).toBe("config");
    expect(kindOfFile("RUNBOOK.MD")).toBe("document");
    expect(kindOfFile("notes.markdown")).toBe("document");
    expect(kindOfFile("archive.zip")).toBe("unknown");
    expect(kindOfFile("Makefile")).toBe("unknown");
  });

  it("treats a leading dot as a hidden file, not an extension", () => {
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("synthetics.config.xml")).toBe("xml");
    expect(kindOfFile(".gitignore")).toBe("unknown");
  });

  it("re-types a file when it is renamed", () => {
    const renamed = treeOf(renameNode(tree(), file("fil_8"), "scratch.xml"));
    expect(kindOfFile(renamed.files.find((f) => f.id === "fil_8")!.name)).toBe("config");
  });
});

describe("rename", () => {
  it("renames a folder, a workflow and a file", () => {
    expect(treeOf(renameNode(tree(), folder("pub-billing"), "Finance")).folders.find((f) => f.id === "pub-billing")!.name)
      .toBe("Finance");
    expect(treeOf(renameNode(tree(), workflow(native.id), "Renamed")).workflows.find((w) => w.id === native.id)!.name)
      .toBe("Renamed");
    expect(treeOf(renameNode(tree(), file("fil_1"), "INDEX.md")).files.find((f) => f.id === "fil_1")!.name)
      .toBe("INDEX.md");
  });

  it("trims, and refuses an empty name or one carrying a path separator", () => {
    expect(treeOf(renameNode(tree(), folder("pub-billing"), "  Finance  ")).folders.find((f) => f.id === "pub-billing")!.name)
      .toBe("Finance");
    expect(reasonOf(renameNode(tree(), folder("pub-billing"), "   "))).toMatch(/can't be empty/);
    expect(reasonOf(renameNode(tree(), folder("pub-billing"), "a/b"))).toMatch(/read as a path/);
  });

  it("refuses a name another sibling already holds, whatever its kind or case", () => {
    // "Billing" and "Onboarding" are siblings under Shared.
    expect(reasonOf(renameNode(tree(), folder("pub-billing"), "Onboarding"))).toMatch(/already here/);
    expect(reasonOf(renameNode(tree(), folder("pub-billing"), "onboarding"))).toMatch(/already here/);
    // A file may not take the name of a workflow filed beside it.
    expect(reasonOf(renameNode(tree(), file("fil_2"), "Payment reconciliation"))).toMatch(/already here/);
  });

  it("lets a node keep its own name", () => {
    expect(renameNode(tree(), folder("pub-billing"), "Billing").ok).toBe(true);
  });

  it("refuses to rename a mirrored workflow", () => {
    expect(reasonOf(renameNode(tree(), workflow(mirrored.id), "Anything"))).toMatch(/mirrored from another platform/);
  });
});

describe("move", () => {
  it("moves a workflow into another folder", () => {
    const moved = treeOf(moveNode(tree(), workflow(native.id), { kind: "folder", id: "pub-onboarding" }));
    expect(moved.workflows.find((w) => w.id === native.id)!.folderId).toBe("pub-onboarding");
  });

  it("moves a folder to the top of a visibility tree", () => {
    const moved = treeOf(moveNode(tree(), folder("pub-billing"), { kind: "root", visibility: "public" }));
    expect(moved.folders.find((f) => f.id === "pub-billing")!.parentId).toBe(null);
  });

  it("refuses to move a folder into its own subtree", () => {
    expect(reasonOf(moveNode(tree(), folder("pub-monitoring"), { kind: "folder", id: "pub-monitoring-synth" })))
      .toMatch(/can't move inside itself/);
    expect(reasonOf(moveNode(tree(), folder("pub-monitoring"), { kind: "folder", id: "pub-monitoring" })))
      .toMatch(/already there|inside itself/);
  });

  it("never offers a destination the rules would refuse", () => {
    const targets = moveTargets(tree(), folder("pub-monitoring"));
    const folderIds = targets.flatMap((t) => (t.kind === "folder" ? [t.id] : []));
    for (const id of subtreeIds(seedFolders, "pub-monitoring")) expect(folderIds).not.toContain(id);
    // Nor the place it already sits.
    expect(folderIds).not.toContain("pub-root");
    // Every offered destination is one `moveNode` actually accepts.
    for (const target of targets) expect(moveNode(tree(), folder("pub-monitoring"), target).ok).toBe(true);
  });

  it("offers a root only to a folder — everything else lives in one", () => {
    expect(moveTargets(tree(), workflow(native.id)).some((t) => t.kind === "root")).toBe(false);
    expect(reasonOf(moveNode(tree(), workflow(native.id), { kind: "root", visibility: "public" })))
      .toMatch(/Only a folder can sit at the top/);
  });

  it("cascades the destination's visibility through the whole subtree", () => {
    const moved = treeOf(moveNode(tree(), folder("pub-monitoring"), { kind: "folder", id: "prv-drafts" }));
    const ids = subtreeIds(seedFolders, "pub-monitoring");
    for (const id of ids) expect(moved.folders.find((f) => f.id === id)!.visibility).toBe("private");
    for (const w of moved.workflows.filter((w) => ids.includes(w.folderId))) expect(w.visibility).toBe("private");
    for (const f of moved.files.filter((f) => ids.includes(f.folderId))) expect(f.visibility).toBe("private");
  });

  it("refuses a move onto a name already taken at the destination", () => {
    // pub-aa holds "status-map.xml"; give the billing file that name and move it there.
    const renamed = treeOf(renameNode(tree(), file("fil_2"), "status-map.xml"));
    expect(reasonOf(moveNode(renamed, file("fil_2"), { kind: "folder", id: "pub-aa" }))).toMatch(/already there/);
  });

  it("refuses a move that changes nothing", () => {
    expect(reasonOf(moveNode(tree(), file("fil_2"), { kind: "folder", id: "pub-billing" }))).toMatch(/already there/);
  });

  it("refuses to move a mirrored workflow", () => {
    expect(reasonOf(moveNode(tree(), workflow(mirrored.id), { kind: "folder", id: "pub-billing" })))
      .toMatch(/mirrored from another platform/);
  });
});

describe("delete", () => {
  it("counts the whole cascade before it happens", () => {
    expect(countUnder(tree(), folder("pub-monitoring"))).toEqual({ folders: 2, workflows: 2, files: 2 });
    expect(countUnder(tree(), file("fil_1"))).toEqual({ folders: 0, workflows: 0, files: 1 });
  });

  it("takes a folder's whole subtree with it", () => {
    const after = treeOf(deleteNode(tree(), folder("pub-monitoring")));
    const ids = subtreeIds(seedFolders, "pub-monitoring");
    for (const id of ids) expect(after.folders.find((f) => f.id === id)).toBeUndefined();
    expect(after.workflows.filter((w) => ids.includes(w.folderId))).toEqual([]);
    expect(after.files.filter((f) => ids.includes(f.folderId))).toEqual([]);
  });

  it("deletes a single workflow or file without touching its neighbours", () => {
    const after = treeOf(deleteNode(tree(), file("fil_2")));
    expect(after.files.find((f) => f.id === "fil_2")).toBeUndefined();
    expect(after.files).toHaveLength(seedFiles.length - 1);
    expect(after.folders).toEqual(seedFolders);
  });

  it("refuses a mirrored workflow, and a folder holding one", () => {
    expect(reasonOf(deleteNode(tree(), workflow(mirrored.id)))).toMatch(/mirrored from another platform/);
    // The cascade must not become a way round the rule.
    expect(reasonOf(deleteNode(tree(), folder("pub-aa")))).toMatch(/mirrored workflows?/);
    expect(reasonOf(deleteNode(tree(), folder("pub-root")))).toMatch(/mirrored workflows?/);
  });
});

describe("create", () => {
  it("mints the next free id from what is already there", () => {
    expect(nextId("fil_", ["fil_1", "fil_8", "fld_20"])).toBe("fil_9");
    expect(nextId("fld_", [])).toBe("fld_1");
    expect(nextId("fil_", ["fil_x", "pub-root"])).toBe("fil_1");
  });

  it("creates a folder, taking the destination's visibility", () => {
    const made = createFolder(tree(), { kind: "folder", id: "prv-root" }, "Experiments");
    if (!made.ok) throw new Error(made.reason);
    expect(made.tree.folders.find((f) => f.id === made.id)).toMatchObject({
      name: "Experiments",
      parentId: "prv-root",
      visibility: "private",
    });
  });

  it("creates a file whose kind follows the name it is given", () => {
    const made = createFile(tree(), "pub-billing", "thresholds.xml", "jk");
    if (!made.ok) throw new Error(made.reason);
    const created = made.tree.files.find((f) => f.id === made.id)!;
    expect(kindOfFile(created.name)).toBe("config");
    expect(created).toMatchObject({ folderId: "pub-billing", visibility: "public", content: "" });
  });

  it("refuses a name already taken at the destination", () => {
    const made = createFile(tree(), "pub-billing", "billing-rules.xml", "jk");
    expect(made.ok).toBe(false);
    const dir = createFolder(tree(), { kind: "folder", id: "pub-root" }, "Billing");
    expect(dir.ok).toBe(false);
  });

  it("steps a default name past whatever is already there", () => {
    const billing = { kind: "folder", id: "pub-billing" } as const;
    expect(freeName(tree(), billing, "untitled", "xml")).toBe("untitled.xml");
    expect(freeName(tree(), billing, "billing-rules", "xml")).toBe("billing-rules-2.xml");
    expect(freeName(tree(), { kind: "folder", id: "pub-root" }, "Billing")).toBe("Billing-2");
    // And the stepped name is one `createFile` accepts.
    const name = freeName(tree(), billing, "billing-rules", "xml");
    expect(createFile(tree(), "pub-billing", name, "jk").ok).toBe(true);
  });
});

describe("the seed tree", () => {
  it("has no two siblings sharing a name", () => {
    const byParent = new Map<string, string[]>();
    const add = (parent: string, name: string) =>
      byParent.set(parent, [...(byParent.get(parent) ?? []), name.toLowerCase()]);
    for (const f of seedFolders) add(f.parentId ?? `root:${f.visibility}`, f.name);
    for (const w of seedWorkflows) add(w.folderId, w.name);
    for (const f of seedFiles) add(f.folderId, f.name);
    for (const [parent, names] of byParent) {
      expect(new Set(names).size, `duplicate name in ${parent}`).toBe(names.length);
    }
  });

  it("files every file in a folder that exists, with that folder's visibility", () => {
    for (const f of seedFiles) {
      const home = seedFolders.find((d) => d.id === f.folderId);
      expect(home, `${f.name} has no folder`).toBeDefined();
      expect(f.visibility).toBe(home!.visibility);
    }
  });
});
