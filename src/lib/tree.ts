import type { Folder } from "../data/types";
import { childFolders, folderTrail, subtreeIds } from "./folders";
import type { LibraryTree } from "./library";

/* =============================================================================
   What the tree shows, and in what order
   -----------------------------------------------------------------------------
   Two questions the library tree keeps asking, both pure, both worth testing
   without a browser:

   - When a search narrows the page, which nodes survive? (`narrowTree`)
   - Given that, what is the top-to-bottom order of the rows on screen?
     (`visibleRows`)

   The second exists because keyboard navigation is only correct if "the next
   row" means the same thing to the arrow keys as it does to the renderer. Two
   implementations of that order would drift the first time someone reorders a
   section; one function used by both cannot.
   ============================================================================= */

/** The subset of the tree a search leaves showing. */
export type TreeSlice = { folders: Set<string>; workflows: Set<string>; files: Set<string> };

/**
 * Which nodes a search shows.
 *
 * The matches, every folder on the path down to one, and — when a folder's own
 * name matched — everything filed beneath it. Keeping the ancestors is the whole
 * point: a flat list of matches answers "what matched" but throws away "where it
 * lives", which is the question the folder tree exists to answer.
 */
export function narrowTree(
  tree: LibraryTree,
  matched: { folders: Set<string>; workflows: Set<string>; files: Set<string> },
): TreeSlice {
  const folders = new Set<string>();
  const workflows = new Set(matched.workflows);
  const files = new Set(matched.files);

  // A folder that matched by name brings its contents with it — you searched for
  // "Billing" to see Billing, not to see an empty row called Billing.
  for (const id of matched.folders) {
    for (const sub of subtreeIds(tree.folders, id)) {
      folders.add(sub);
      for (const w of tree.workflows) if (w.folderId === sub) workflows.add(w.id);
      for (const f of tree.files) if (f.folderId === sub) files.add(f.id);
    }
  }

  // Anything showing needs its ancestry, or it has nothing to hang from.
  const addAncestry = (folderId: string) => {
    for (const f of folderTrail(tree.folders, folderId)) folders.add(f.id);
  };
  for (const w of tree.workflows) if (workflows.has(w.id)) addAncestry(w.folderId);
  for (const f of tree.files) if (files.has(f.id)) addAncestry(f.folderId);
  for (const id of [...folders]) addAncestry(id);

  return { folders, workflows, files };
}

/** One row as the tree draws it. */
export type TreeRowInfo = {
  /** A node id, or `vis:public` / `vis:private` for a section header. */
  id: string;
  kind: "root" | "folder" | "workflow" | "file";
  depth: number;
  /** The row this one sits under, or null at the top. */
  parentId: string | null;
  /** Whether it holds anything, and whether that is currently showing. */
  expandable: boolean;
  expanded: boolean;
};

/**
 * Every row currently on screen, top to bottom.
 *
 * Call it with the same tree the view renders — narrowed and ordered — so the
 * cursor's "next row" is the row the eye sees next. Section order matches the
 * renderer exactly: subfolders, then workflows, then files.
 */
export function visibleRows(
  tree: LibraryTree,
  { expanded, slice }: { expanded: (id: string) => boolean; slice?: TreeSlice },
): TreeRowInfo[] {
  const rows: TreeRowInfo[] = [];
  const shows = (kind: keyof TreeSlice, id: string) => !slice || slice[kind].has(id);

  const walk = (folder: Folder, depth: number, parentId: string) => {
    const kids = childFolders(tree.folders, folder.id).filter((f) => shows("folders", f.id));
    const flows = tree.workflows.filter((w) => w.folderId === folder.id && shows("workflows", w.id));
    const docs = tree.files.filter((f) => f.folderId === folder.id && shows("files", f.id));
    const open = expanded(folder.id);
    rows.push({
      id: folder.id,
      kind: "folder",
      depth,
      parentId,
      expandable: kids.length + flows.length + docs.length > 0,
      expanded: open,
    });
    if (!open) return;
    for (const k of kids) walk(k, depth + 1, folder.id);
    for (const w of flows)
      rows.push({ id: w.id, kind: "workflow", depth: depth + 1, parentId: folder.id, expandable: false, expanded: false });
    for (const d of docs)
      rows.push({ id: d.id, kind: "file", depth: depth + 1, parentId: folder.id, expandable: false, expanded: false });
  };

  for (const visibility of ["public", "private"] as const) {
    const key = `vis:${visibility}`;
    const tops = childFolders(tree.folders, null, visibility).filter((f) => shows("folders", f.id));
    const open = expanded(key);
    rows.push({ id: key, kind: "root", depth: 0, parentId: null, expandable: tops.length > 0, expanded: open });
    if (!open) continue;
    for (const f of tops) walk(f, 1, key);
  }
  return rows;
}

/* ------------------------------------------------------------ cursor movement */

/** Where an arrow key lands. Returns the row id to move to, or null to stay. */
export function rowAfter(rows: TreeRowInfo[], id: string, step: 1 | -1): string | null {
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return rows[0]?.id ?? null;
  return rows[i + step]?.id ?? null;
}

/**
 * The row a typed character jumps to: the next row whose name starts with it,
 * wrapping past the end. Typeahead is what makes a long tree navigable without
 * arrowing through every row between here and there.
 */
export function rowMatching(
  rows: TreeRowInfo[],
  from: string,
  prefix: string,
  nameOf: (row: TreeRowInfo) => string,
): string | null {
  const wanted = prefix.toLowerCase();
  const start = rows.findIndex((r) => r.id === from);
  for (let n = 1; n <= rows.length; n += 1) {
    const row = rows[(start + n) % rows.length];
    if (nameOf(row).toLowerCase().startsWith(wanted)) return row.id;
  }
  return null;
}
