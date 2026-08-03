import type { FileKind, Folder, LibraryFile, Visibility, Workflow } from "../data/types";
import { subtreeIds } from "./folders";

/* =============================================================================
   Editing the library tree
   -----------------------------------------------------------------------------
   Rename, move, delete and create, as pure functions over the whole tree.

   They live here rather than in the store because every one of them is a rule
   somebody can break by accident — dropping a folder into its own subtree,
   renaming a file onto its neighbour, deleting a folder without knowing what
   went with it. A rule stated in an event handler is a rule that only holds on
   the path that handler covers; stated here, it holds for every caller and can
   be tested without a browser.

   Nothing mutates in place: an edit returns a new tree, or a refusal carrying
   the reason in the words the UI shows. A refused edit leaves the caller's tree
   exactly as it was.
   ============================================================================= */

/** The three collections that make up the library tree. */
export type LibraryTree = { folders: Folder[]; workflows: Workflow[]; files: LibraryFile[] };

/** One addressable thing in the tree. */
export type LibraryNode =
  | { kind: "folder"; id: string }
  | { kind: "workflow"; id: string }
  | { kind: "file"; id: string };

/** Where a move lands: inside a folder, or at the top of a visibility tree. Only
 *  a folder can sit at the top — a workflow and a file always live in one. */
export type MoveTarget = { kind: "folder"; id: string } | { kind: "root"; visibility: Visibility };

/** The outcome of an edit. */
export type EditResult = { ok: true; tree: LibraryTree } | { ok: false; reason: string };

/** The outcome of a create, which also hands back the new id so the caller can
 *  select it (and drop straight into renaming it). */
export type CreateResult = { ok: true; tree: LibraryTree; id: string } | { ok: false; reason: string };

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/* --------------------------------------------------------------------- file kind */

/** Extensions the library renders differently. Anything else is `unknown`, which
 *  is a state we show rather than a fallback we hide. */
const EXTENSION_KIND: Record<string, FileKind> = {
  xml: "config",
  config: "config",
  md: "document",
  markdown: "document",
  txt: "document",
};

/** The extension of a file name, lowercased, without the dot. A leading dot is a
 *  hidden file, not an extension (".gitignore" has none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** What kind of file a name describes. Read from the name rather than stored, so
 *  a rename re-types the file and the icon can never disagree with the label. */
export function kindOfFile(name: string): FileKind {
  return EXTENSION_KIND[extensionOf(name)] ?? "unknown";
}

/* ------------------------------------------------------------------- lookups */

/** The name a node currently carries, or null when the id is unknown. */
export function nodeName(tree: LibraryTree, node: LibraryNode): string | null {
  if (node.kind === "folder") return tree.folders.find((f) => f.id === node.id)?.name ?? null;
  if (node.kind === "workflow") return tree.workflows.find((w) => w.id === node.id)?.name ?? null;
  return tree.files.find((f) => f.id === node.id)?.name ?? null;
}

/** A workflow authored on another platform. It is mirrored here by its connector,
 *  so an edit of ours would be overwritten by the next sync — which is why the
 *  library refuses one rather than pretending it took. */
function mirroredWorkflow(tree: LibraryTree, node: LibraryNode): Workflow | null {
  if (node.kind !== "workflow") return null;
  const workflow = tree.workflows.find((w) => w.id === node.id);
  return workflow && workflow.platform !== "conduit" ? workflow : null;
}

const mirrorRefusal = (workflow: Workflow) =>
  refuse(
    `"${workflow.name}" is mirrored from another platform. It is authored there, and the next sync would overwrite anything changed here.`,
  );

/**
 * Why a node can't be edited, or null when it can.
 *
 * One gate for every surface that needs to ask — the row menu's explain panel,
 * whether a row is draggable, whether a keyboard shortcut fires. Asking the same
 * question three ways is how a menu ends up offering an action the rules refuse.
 */
export function readOnlyReason(tree: LibraryTree, node: LibraryNode): string | null {
  const mirror = mirroredWorkflow(tree, node);
  return mirror ? mirrorRefusal(mirror).reason : null;
}

/** Everything sitting directly in a destination, whatever its kind — one flat
 *  namespace, because two rows with one name in one folder is a tree nobody can
 *  read out loud. */
function siblingsAt(tree: LibraryTree, target: MoveTarget): { id: string; name: string }[] {
  if (target.kind === "root") {
    return tree.folders
      .filter((f) => f.parentId === null && f.visibility === target.visibility)
      .map((f) => ({ id: f.id, name: f.name }));
  }
  return [
    ...tree.folders.filter((f) => f.parentId === target.id).map((f) => ({ id: f.id, name: f.name })),
    ...tree.workflows.filter((w) => w.folderId === target.id).map((w) => ({ id: w.id, name: w.name })),
    ...tree.files.filter((f) => f.folderId === target.id).map((f) => ({ id: f.id, name: f.name })),
  ];
}

/** Where a node sits today, in the shape a move target takes. */
function locationOf(tree: LibraryTree, node: LibraryNode): MoveTarget | null {
  if (node.kind === "folder") {
    const folder = tree.folders.find((f) => f.id === node.id);
    if (!folder) return null;
    return folder.parentId === null
      ? { kind: "root", visibility: folder.visibility }
      : { kind: "folder", id: folder.parentId };
  }
  const owner =
    node.kind === "workflow"
      ? tree.workflows.find((w) => w.id === node.id)
      : tree.files.find((f) => f.id === node.id);
  return owner ? { kind: "folder", id: owner.folderId } : null;
}

const sameTarget = (a: MoveTarget, b: MoveTarget) =>
  a.kind === "root" && b.kind === "root"
    ? a.visibility === b.visibility
    : a.kind === "folder" && b.kind === "folder" && a.id === b.id;

/** The visibility a destination confers on what lands in it. */
function visibilityAt(tree: LibraryTree, target: MoveTarget): Visibility | null {
  if (target.kind === "root") return target.visibility;
  return tree.folders.find((f) => f.id === target.id)?.visibility ?? null;
}

/* ------------------------------------------------------------------- validation */

/** A name a tree row can carry. `/` is out because it reads as a path and would
 *  describe a nesting the tree doesn't have. */
function checkName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim();
  if (name === "") return refuse("A name can't be empty.");
  if (name.includes("/")) return refuse('A name can\'t contain "/" — it would read as a path.');
  return { ok: true, name };
}

/** Whether a name is already taken in a destination. Case-insensitive: two rows
 *  differing only in case read as the same row to everyone but the computer. */
function nameTaken(tree: LibraryTree, target: MoveTarget, name: string, exceptId: string): boolean {
  const wanted = name.toLowerCase();
  return siblingsAt(tree, target).some((s) => s.id !== exceptId && s.name.toLowerCase() === wanted);
}

/* ---------------------------------------------------------------------- rename */

/** Rename a node in place. */
export function renameNode(tree: LibraryTree, node: LibraryNode, raw: string): EditResult {
  const mirror = mirroredWorkflow(tree, node);
  if (mirror) return mirrorRefusal(mirror);

  const checked = checkName(raw);
  if (!checked.ok) return checked;
  const { name } = checked;

  const here = locationOf(tree, node);
  if (!here) return refuse("That item no longer exists.");
  if (nameTaken(tree, here, name, node.id)) return refuse(`Something called "${name}" is already here.`);

  if (node.kind === "folder") {
    return { ok: true, tree: { ...tree, folders: tree.folders.map((f) => (f.id === node.id ? { ...f, name } : f)) } };
  }
  if (node.kind === "workflow") {
    return {
      ok: true,
      tree: {
        ...tree,
        workflows: tree.workflows.map((w) => (w.id === node.id ? { ...w, name, updatedAgo: "just now" } : w)),
      },
    };
  }
  return {
    ok: true,
    tree: { ...tree, files: tree.files.map((f) => (f.id === node.id ? { ...f, name, updatedAgo: "just now" } : f)) },
  };
}

/* ------------------------------------------------------------------------ move */

/** Every folder a node may legally move into, plus the two visibility roots when
 *  the node is a folder. This is what the move menu is built from, so a
 *  destination the rules would refuse is never offered in the first place. */
export function moveTargets(tree: LibraryTree, node: LibraryNode): MoveTarget[] {
  // A node that can't be edited has nowhere to go, and saying so here means the
  // menu and the drag both learn it from the same call.
  if (readOnlyReason(tree, node)) return [];
  const here = locationOf(tree, node);
  const forbidden = node.kind === "folder" ? new Set(subtreeIds(tree.folders, node.id)) : new Set<string>();
  const folders: MoveTarget[] = tree.folders
    .filter((f) => !forbidden.has(f.id))
    .map((f) => ({ kind: "folder", id: f.id }));
  const roots: MoveTarget[] =
    node.kind === "folder"
      ? [
          { kind: "root", visibility: "public" },
          { kind: "root", visibility: "private" },
        ]
      : [];
  return [...roots, ...folders].filter((t) => !here || !sameTarget(t, here));
}

/**
 * Move a node into a folder, or a folder to the top of a visibility tree.
 *
 * Two rules carry this. A folder may not land inside its own subtree — that
 * detaches the whole branch from the tree and there is no screen it would show up
 * on again. And a move inherits the destination's visibility, cascading through
 * the subtree: a private folder holding public children would be lying about who
 * can see what.
 */
export function moveNode(tree: LibraryTree, node: LibraryNode, target: MoveTarget): EditResult {
  const mirror = mirroredWorkflow(tree, node);
  if (mirror) return mirrorRefusal(mirror);

  const name = nodeName(tree, node);
  if (name === null) return refuse("That item no longer exists.");

  if (target.kind === "root" && node.kind !== "folder") {
    return refuse("Only a folder can sit at the top of the tree — everything else lives in one.");
  }
  if (target.kind === "folder" && !tree.folders.some((f) => f.id === target.id)) {
    return refuse("That folder no longer exists.");
  }

  const here = locationOf(tree, node);
  if (here && sameTarget(here, target)) return refuse(`"${name}" is already there.`);

  if (node.kind === "folder" && target.kind === "folder") {
    if (subtreeIds(tree.folders, node.id).includes(target.id)) {
      return refuse(`"${name}" can't move inside itself — the whole branch would come with it.`);
    }
  }
  if (nameTaken(tree, target, name, node.id)) return refuse(`Something called "${name}" is already there.`);

  const visibility = visibilityAt(tree, target);
  if (visibility === null) return refuse("That folder no longer exists.");

  if (node.kind === "folder") {
    // The subtree follows: every folder under it, and everything filed in any of
    // them, takes the destination's visibility.
    const moved = new Set(subtreeIds(tree.folders, node.id));
    return {
      ok: true,
      tree: {
        folders: tree.folders.map((f) =>
          f.id === node.id
            ? { ...f, parentId: target.kind === "root" ? null : target.id, visibility }
            : moved.has(f.id)
              ? { ...f, visibility }
              : f,
        ),
        workflows: tree.workflows.map((w) => (moved.has(w.folderId) ? { ...w, visibility } : w)),
        files: tree.files.map((f) => (moved.has(f.folderId) ? { ...f, visibility } : f)),
      },
    };
  }

  const folderId = (target as { kind: "folder"; id: string }).id;
  if (node.kind === "workflow") {
    return {
      ok: true,
      tree: {
        ...tree,
        workflows: tree.workflows.map((w) =>
          w.id === node.id ? { ...w, folderId, visibility, updatedAgo: "just now" } : w,
        ),
      },
    };
  }
  return {
    ok: true,
    tree: {
      ...tree,
      files: tree.files.map((f) => (f.id === node.id ? { ...f, folderId, visibility, updatedAgo: "just now" } : f)),
    },
  };
}

/* ---------------------------------------------------------------------- delete */

/** What a delete would take with it — the folder's whole subtree, not just the
 *  row you clicked. The confirm quotes this, because a cascade nobody was shown
 *  is a cascade nobody agreed to. */
export function countUnder(tree: LibraryTree, node: LibraryNode): { folders: number; workflows: number; files: number } {
  if (node.kind !== "folder") {
    return { folders: 0, workflows: node.kind === "workflow" ? 1 : 0, files: node.kind === "file" ? 1 : 0 };
  }
  const ids = new Set(subtreeIds(tree.folders, node.id));
  return {
    folders: ids.size,
    workflows: tree.workflows.filter((w) => ids.has(w.folderId)).length,
    files: tree.files.filter((f) => ids.has(f.folderId)).length,
  };
}

/** Delete a node, and — for a folder — everything beneath it. */
export function deleteNode(tree: LibraryTree, node: LibraryNode): EditResult {
  const mirror = mirroredWorkflow(tree, node);
  if (mirror) return mirrorRefusal(mirror);

  if (nodeName(tree, node) === null) return refuse("That item no longer exists.");

  if (node.kind === "folder") {
    const doomed = new Set(subtreeIds(tree.folders, node.id));
    // A mirrored workflow can't be deleted on its own, so a folder holding one
    // can't be deleted either — otherwise the cascade is a way round the rule.
    const mirrors = tree.workflows.filter((w) => doomed.has(w.folderId) && w.platform !== "conduit");
    if (mirrors.length > 0) {
      return refuse(
        `This folder holds ${mirrors.length} mirrored workflow${mirrors.length === 1 ? "" : "s"} authored on another platform. Deleting it here wouldn't delete them there.`,
      );
    }
    return {
      ok: true,
      tree: {
        folders: tree.folders.filter((f) => !doomed.has(f.id)),
        workflows: tree.workflows.filter((w) => !doomed.has(w.folderId)),
        files: tree.files.filter((f) => !doomed.has(f.folderId)),
      },
    };
  }
  if (node.kind === "workflow") {
    return { ok: true, tree: { ...tree, workflows: tree.workflows.filter((w) => w.id !== node.id) } };
  }
  return { ok: true, tree: { ...tree, files: tree.files.filter((f) => f.id !== node.id) } };
}

/* ---------------------------------------------------------------------- create */

/** The next free id for a prefix, e.g. "fld_4". Derived from what's already
 *  there rather than from a clock, so the same tree always yields the same id. */
export function nextId(prefix: string, taken: string[]): string {
  let highest = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return `${prefix}${highest + 1}`;
}

/** A name nothing at the destination is using yet: "untitled.md", then
 *  "untitled-2.md", and so on. Creating something should never fail because the
 *  obvious default was already taken. */
export function freeName(tree: LibraryTree, target: MoveTarget, base: string, extension = ""): string {
  const suffix = extension ? `.${extension}` : "";
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? `${base}${suffix}` : `${base}-${n}${suffix}`;
    if (!nameTaken(tree, target, name, "")) return name;
  }
}

/** Create an empty folder in a destination. */
export function createFolder(tree: LibraryTree, target: MoveTarget, raw: string): CreateResult {
  const checked = checkName(raw);
  if (!checked.ok) return checked;
  const { name } = checked;

  const visibility = visibilityAt(tree, target);
  if (visibility === null) return refuse("That folder no longer exists.");
  if (nameTaken(tree, target, name, "")) return refuse(`Something called "${name}" is already there.`);

  const id = nextId("fld_", tree.folders.map((f) => f.id));
  const folder: Folder = { id, name, parentId: target.kind === "root" ? null : target.id, visibility };
  return { ok: true, id, tree: { ...tree, folders: [...tree.folders, folder] } };
}

/** Create an empty file in a folder. Its kind follows the name it's given. */
export function createFile(tree: LibraryTree, folderId: string, raw: string, ownerId: string): CreateResult {
  const checked = checkName(raw);
  if (!checked.ok) return checked;
  const { name } = checked;

  const target: MoveTarget = { kind: "folder", id: folderId };
  const visibility = visibilityAt(tree, target);
  if (visibility === null) return refuse("That folder no longer exists.");
  if (nameTaken(tree, target, name, "")) return refuse(`Something called "${name}" is already there.`);

  const id = nextId("fil_", tree.files.map((f) => f.id));
  const file: LibraryFile = { id, name, folderId, visibility, ownerId, updatedAgo: "just now", content: "" };
  return { ok: true, id, tree: { ...tree, files: [...tree.files, file] } };
}
