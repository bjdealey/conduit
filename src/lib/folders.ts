import type { Folder, Visibility, Workflow } from "../data/types";

/* =============================================================================
   Folder-tree helpers for the workflow library
   -----------------------------------------------------------------------------
   The tree is stored flat — every folder carries a `parentId` — so each question
   about ancestry or containment is a walk. Keeping the walks here means the
   library tree, the folder detail and the titlebar breadcrumb all read the same
   answers, and a malformed parent chain can't hang the page: every walk carries
   a visited set, so a cycle terminates instead of looping forever.
   ============================================================================= */

/** Direct children of a folder — or the roots of one visibility tree, when
 *  `parentId` is null and a `visibility` is given.
 *
 *  Sorted by name, because the alternative is insertion order: a folder created
 *  today lands at the bottom of its siblings rather than where its name says it
 *  belongs, and the same list is what the move menu is built from. */
export function childFolders(folders: Folder[], parentId: string | null, visibility?: Visibility): Folder[] {
  return folders
    .filter((f) => f.parentId === parentId && (visibility === undefined || f.visibility === visibility))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A folder and its ancestors, outermost first. Empty when the id is unknown. */
export function folderTrail(folders: Folder[], folderId: string): Folder[] {
  const trail: Folder[] = [];
  const seen = new Set<string>();
  let cur = folders.find((f) => f.id === folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift(cur);
    const parentId = cur.parentId;
    cur = parentId ? folders.find((f) => f.id === parentId) : undefined;
  }
  return trail;
}

/** Ancestry path of a folder, e.g. "Shared / Monitoring / Synthetics". */
export function folderPath(folders: Folder[], folderId: string): string {
  return folderTrail(folders, folderId)
    .map((f) => f.name)
    .join(" / ");
}

/** A folder and every folder beneath it, outermost first. Unknown ids yield the
 *  id alone, so a caller filtering on the result finds nothing rather than
 *  everything. */
export function subtreeIds(folders: Folder[], folderId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
    for (const child of folders.filter((f) => f.parentId === id)) walk(child.id);
  };
  walk(folderId);
  return ids;
}

/** Workflows anywhere beneath a folder. This — not the direct contents — is what
 *  a folder is worth summarising by: a folder holding only subfolders still
 *  holds work. */
export function workflowsUnder(workflows: Workflow[], folders: Folder[], folderId: string): Workflow[] {
  const ids = new Set(subtreeIds(folders, folderId));
  return workflows.filter((w) => ids.has(w.folderId));
}
