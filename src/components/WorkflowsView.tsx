import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Globe,
  Link2,
  Lock,
  MoreHorizontal,
  Package,
  Pencil,
  Play,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { useStore } from "../store";
import {
  WORKFLOW_STATUSES,
  availableTransitions,
  explainRequirements,
  hasUnpublishedChanges,
  publishedVersion,
} from "@conduit/domain";
import { PLATFORM_LABEL } from "../data/types";
import type { FileKind, Folder, LibraryFile, Workflow, WorkflowStatus, Visibility } from "../data/types";
import { Avatar } from "./Avatar";
import { Chip } from "./Chip";
import { WORKFLOW_STATUS_ACCENT, WorkflowStatusChip } from "./Badges";
import { RunRow } from "./RunRow";
import { minutesAgo, num } from "../lib/format";
import { childFolders, folderPath, subtreeIds, workflowsUnder } from "../lib/folders";
import { kindOfFile, moveTargets, type LibraryNode, type LibraryTree, type MoveTarget } from "../lib/library";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { isNarrowed, matchesQuery, ordered, passesFilter, resolveSort, type WorkspaceState } from "../lib/workspace";
import { workspaceControls } from "../data/workspaceControls";
import { TabStrip } from "./TabStrip";
import { StatTile } from "./StatTile";
import { Reveal } from "./Reveal";
import { ActionMenu, type ActionItem, type MenuPanel } from "./ActionMenu";
import { Button } from "./Button";

/* ------------------------------------------------------------------ shared bits */

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** Workflows narrowed and ordered by the workspace header — the same set the
 *  library tree, the search results, and the board all draw from. */
function visibleWorkflows(workflows: Workflow[], state: WorkspaceState): Workflow[] {
  const rows = workflows.filter(
    (a) =>
      matchesQuery(state.query, [a.name, a.id, a.description, a.packages.join(" ")]) &&
      passesFilter(state, "status", a.status) &&
      passesFilter(state, "visibility", a.visibility) &&
      passesFilter(state, "platform", a.platform) &&
      passesFilter(state, "migration", a.migration),
  );

  const { id, dir } = resolveSort(state, workspaceControls("workflows", "")?.sorts ?? []);
  const compare: Record<string, (a: Workflow, b: Workflow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    runs: (a, b) => a.runCount - b.runCount,
    success: (a, b) => a.successRate - b.successRate,
    // Oldest run first, so the descending default reads most-recently-run.
    recent: (a, b) => (minutesAgo(b.lastRunAt) ?? Infinity) - (minutesAgo(a.lastRunAt) ?? Infinity),
  };
  return ordered(rows, dir, compare[id] ?? compare.name);
}

/** Files narrowed by the same header. A file has no status, platform or migration
 *  state, so a filter on any of those is a filter about workflows — and the files
 *  drop out rather than sitting there as counter-examples to what the header says
 *  the page is showing. */
function narrowedFiles(files: LibraryFile[], state: WorkspaceState): LibraryFile[] {
  const workflowOnly = ["status", "platform", "migration"].some((f) => state.filters[f]);
  if (workflowOnly) return [];
  return files
    .filter((f) => matchesQuery(state.query, [f.name, f.id, f.content]) && passesFilter(state, "visibility", f.visibility))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ----------------------------------------------------------------- folder tree */

/** The icon that says what a row is. Glyph first — colour only reinforces it, so
 *  the tree still differentiates for anyone who can't tell the tints apart. */
const FILE_ICON: Record<FileKind, { icon: ReactNode; tone: string; label: string }> = {
  config: { icon: <FileCode2 size={14} strokeWidth={1.8} />, tone: "var(--cyan-a11)", label: "Config" },
  document: { icon: <FileText size={14} strokeWidth={1.8} />, tone: "var(--color-tertiary-foreground)", label: "Document" },
  unknown: { icon: <FileIcon size={14} strokeWidth={1.8} />, tone: "var(--color-tertiary-foreground)", label: "File" },
};

const WORKFLOW_ROW_ICON = { icon: <WorkflowIcon size={14} strokeWidth={1.8} />, tone: "var(--violet-a11)" };

function TreeRow({
  depth,
  icon,
  iconTone,
  label,
  active,
  hasChildren,
  open,
  onToggle,
  onSelect,
  trailing,
  menu,
  renaming = false,
  onRename,
  onCancelRename,
}: {
  depth: number;
  icon: ReactNode;
  /** Colour for the icon only — never the sole carrier of what a row is. */
  iconTone?: string;
  label: string;
  active: boolean;
  hasChildren: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: () => void;
  trailing?: ReactNode;
  /** The row's "…" menu. Given the open state so the row can keep it visible
   *  while it's showing — an open popover hangs below the row, outside the box
   *  that hover applies to, so a hover-only rule would hide it the moment you
   *  reached for it. */
  menu?: (control: { open: boolean; setOpen: (open: boolean) => void }) => ReactNode;
  renaming?: boolean;
  onRename?: (name: string) => void;
  onCancelRename?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const revealed = hovered || focused || menuOpen;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={
        "focusable group flex h-8 w-full items-center gap-1 rounded-lg pr-1 text-left transition-colors " +
        // Only the inactive row takes a hover tint — an inline background would
        // beat the class, so the active row keeps its own and stays put.
        (active ? "" : "hover:bg-transparent-hover")
      }
      style={{ paddingLeft: 6 + depth * 14, background: active ? "var(--color-transparent-hover)" : undefined }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Collapse" : "Expand"}
        className="flex size-4 shrink-0 items-center justify-center rounded text-tertiary-foreground transition-colors hover:text-primary-foreground"
        style={{ visibility: hasChildren ? "visible" : "hidden" }}
      >
        <ChevronRight size={13} strokeWidth={2} style={{ transform: open ? "rotate(90deg)" : "none" }} />
      </button>

      {renaming && onRename ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 py-1">
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: 16, height: 16, color: iconTone ?? "var(--color-tertiary-foreground)" }}
          >
            {icon}
          </span>
          <RenameField value={label} onCommit={onRename} onCancel={onCancelRename ?? (() => {})} />
        </span>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: 16, height: 16, color: iconTone ?? "var(--color-tertiary-foreground)" }}
          >
            {icon}
          </span>
          <span className="truncate text-body-sm text-primary-foreground">{label}</span>
        </button>
      )}

      {!renaming && (trailing || menu) && (
        // The menu takes the metadata's slot rather than a column of its own: a
        // reserved ellipsis on every row would cost the names ~30px of a 20rem
        // pane, and the status and owner are worth more at rest than an action
        // nobody is reaching for yet. Reaching for it swaps them.
        <span className="flex shrink-0 items-center gap-1.5 pr-0.5">
          {revealed && menu ? menu({ open: menuOpen, setOpen: setMenuOpen }) : trailing}
        </span>
      )}
    </div>
  );
}

/** The inline rename input. Commits on Enter or blur, abandons on Escape —
 *  the file-tree contract, so renaming never costs a dialog. */
function RenameField({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  // Select the stem, not the extension: renaming "runbook.md" is almost never
  // about the ".md".
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    const dot = value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, [value]);

  return (
    <input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => (draft.trim() === value ? onCancel() : onCommit(draft))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(draft);
        if (e.key === "Escape") onCancel();
      }}
      aria-label="New name"
      className="min-w-0 flex-1 rounded-md bg-component px-1.5 py-0.5 text-body-sm text-primary-foreground outline-none"
    />
  );
}

/* ------------------------------------------------------------------ row menus */

/** What a row's menu needs to build itself. Threaded down the tree as one object
 *  so adding an edit doesn't mean adding a prop to every level. */
type TreeEdits = {
  tree: LibraryTree;
  /** Whether the signed-in tier may edit the library at all. */
  editable: boolean;
  renamingId: string | null;
  startRename: (id: string) => void;
  cancelRename: () => void;
  commitRename: (node: LibraryNode, name: string) => void;
  move: (node: LibraryNode, target: MoveTarget) => void;
  remove: (node: LibraryNode) => void;
  createFolder: (target: MoveTarget) => void;
  createFile: (folderId: string, extension: string) => void;
  /** What a delete would take with it, for the confirm's tally. */
  countUnder: (node: LibraryNode) => { folders: number; workflows: number; files: number };
};

const targetLabel = (tree: LibraryTree, target: MoveTarget) =>
  target.kind === "root"
    ? `Top of ${target.visibility === "public" ? "Public" : "Private"}`
    : tree.folders.find((f) => f.id === target.id)?.name ?? target.id;

/** The "…" menu on a tree row: create (folders only), rename, move, delete.
 *
 *  A mirrored workflow gets a panel that explains instead of a panel that acts.
 *  The rules would refuse every one of these edits on it, and a menu full of
 *  items that always fail teaches nothing — the reason does. */
function RowMenu({
  node,
  edits,
  control,
}: {
  node: LibraryNode;
  edits: TreeEdits;
  control: { open: boolean; setOpen: (open: boolean) => void };
}) {
  const { tree } = edits;
  const name = nodeLabel(tree, node);
  const mirrored =
    node.kind === "workflow" && tree.workflows.find((w) => w.id === node.id)?.platform !== "conduit";

  const panel = (id: string, go: (next: string) => void): MenuPanel => {
    if (mirrored) {
      const workflow = tree.workflows.find((w) => w.id === node.id)!;
      return {
        heading: "Mirrored",
        note: `Authored on ${PLATFORM_LABEL[workflow.platform]} and reflected here by its connector. Renaming, moving or deleting it here would be undone by the next sync.`,
        items: [],
      };
    }

    if (id === "move") {
      const targets = moveTargets(tree, node);
      return {
        heading: `Move ${name}`,
        onBack: () => go("root"),
        scroll: true,
        items: targets.map((target) => ({
          id: target.kind === "root" ? `root:${target.visibility}` : target.id,
          label: targetLabel(tree, target),
          detail:
            target.kind === "folder"
              ? folderPath(tree.folders, target.id).split(" / ").slice(0, -1).join(" / ") || "top level"
              : undefined,
          icon: <FolderIcon size={14} strokeWidth={1.8} />,
          onSelect: () => edits.move(node, target),
        })),
      };
    }

    if (id === "delete") {
      const under = edits.countUnder(node);
      const tally =
        node.kind === "folder"
          ? `${under.folders} folder${under.folders === 1 ? "" : "s"}, ${under.workflows} workflow${under.workflows === 1 ? "" : "s"} and ${under.files} file${under.files === 1 ? "" : "s"} go with it.`
          : "This can't be undone.";
      return {
        heading: `Delete ${name}`,
        note: tally,
        onBack: () => go("root"),
        items: [
          { id: "confirm", label: "Delete", icon: <Trash2 size={14} strokeWidth={1.8} />, danger: true, onSelect: () => edits.remove(node) },
          { id: "cancel", label: "Cancel", icon: <X size={14} strokeWidth={1.8} />, onSelect: () => {} },
        ],
      };
    }

    const items: ActionItem[] = [];
    if (node.kind === "folder") {
      items.push(
        {
          id: "new-folder",
          label: "New folder",
          icon: <FolderPlus size={14} strokeWidth={1.8} />,
          onSelect: () => edits.createFolder({ kind: "folder", id: node.id }),
        },
        {
          id: "new-config",
          label: "New config",
          detail: "untitled.xml",
          icon: <FileCode2 size={14} strokeWidth={1.8} />,
          onSelect: () => edits.createFile(node.id, "xml"),
        },
        {
          id: "new-doc",
          label: "New document",
          detail: "untitled.md",
          icon: <FilePlus2 size={14} strokeWidth={1.8} />,
          onSelect: () => edits.createFile(node.id, "md"),
        },
      );
    }
    items.push(
      { id: "rename", label: "Rename", icon: <Pencil size={14} strokeWidth={1.8} />, onSelect: () => edits.startRename(node.id) },
      { id: "move", label: "Move to…", icon: <ArrowUpRight size={14} strokeWidth={1.8} />, keepOpen: true, onSelect: () => go("move") },
      {
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={14} strokeWidth={1.8} />,
        danger: true,
        keepOpen: true,
        onSelect: () => go("delete"),
      },
    );
    return { items };
  };

  return (
    <ActionMenu
      label={`Actions for ${name}`}
      align="right"
      open={control.open}
      onOpenChange={control.setOpen}
      trigger={<MoreHorizontal size={15} strokeWidth={2} />}
      panel={panel}
    />
  );
}

/** The name a node shows in a menu heading. */
function nodeLabel(tree: LibraryTree, node: LibraryNode): string {
  if (node.kind === "folder") return tree.folders.find((f) => f.id === node.id)?.name ?? "";
  if (node.kind === "workflow") return tree.workflows.find((w) => w.id === node.id)?.name ?? "";
  return tree.files.find((f) => f.id === node.id)?.name ?? "";
}

/* ------------------------------------------------------------------- tree rows */

/** A selectable workflow leaf: type icon, name, then status and owner trailing.
 *  The status dot moved right when the icon arrived — the left slot now says what
 *  a row *is*, consistently, and status is a second fact rather than the only one. */
function WorkflowLeaf({
  workflow,
  depth,
  active,
  onSelect,
  edits,
}: {
  workflow: Workflow;
  depth: number;
  active: boolean;
  onSelect: () => void;
  edits: TreeEdits;
}) {
  const { memberById } = useStore();
  const owner = memberById(workflow.ownerId);
  const accent = WORKFLOW_STATUS_ACCENT[workflow.status];
  const node: LibraryNode = { kind: "workflow", id: workflow.id };
  return (
    <TreeRow
      depth={depth}
      icon={WORKFLOW_ROW_ICON.icon}
      iconTone={WORKFLOW_ROW_ICON.tone}
      label={workflow.name}
      active={active}
      hasChildren={false}
      open={false}
      onToggle={() => {}}
      onSelect={onSelect}
      renaming={edits.renamingId === workflow.id}
      onRename={(name) => edits.commitRename(node, name)}
      onCancelRename={edits.cancelRename}
      trailing={
        <>
          <span
            className="size-2 shrink-0 rounded-full"
            title={workflow.status}
            style={{ background: `var(--${accent}-9)` }}
          />
          {owner && <Avatar member={owner} size={18} />}
        </>
      }
      menu={edits.editable ? (control) => <RowMenu node={node} edits={edits} control={control} /> : undefined}
    />
  );
}

/** A file leaf — a config or a document filed beside the workflows. */
function FileLeaf({
  file,
  depth,
  active,
  onSelect,
  edits,
}: {
  file: LibraryFile;
  depth: number;
  active: boolean;
  onSelect: () => void;
  edits: TreeEdits;
}) {
  const { memberById } = useStore();
  const owner = memberById(file.ownerId);
  const look = FILE_ICON[kindOfFile(file.name)];
  const node: LibraryNode = { kind: "file", id: file.id };
  return (
    <TreeRow
      depth={depth}
      icon={look.icon}
      iconTone={look.tone}
      label={file.name}
      active={active}
      hasChildren={false}
      open={false}
      onToggle={() => {}}
      onSelect={onSelect}
      renaming={edits.renamingId === file.id}
      onRename={(name) => edits.commitRename(node, name)}
      onCancelRename={edits.cancelRename}
      trailing={owner ? <Avatar member={owner} size={18} /> : undefined}
      menu={edits.editable ? (control) => <RowMenu node={node} edits={edits} control={control} /> : undefined}
    />
  );
}

/** One folder branch: the folder row, then (when open) its subfolders, the
 *  workflows and the files that live directly in it.
 *
 *  A folder row carries two separate actions, because it answers two questions:
 *  the chevron expands it (what's underneath?), and the label opens it (what does
 *  it hold?). Only the second is a selection — expanding a folder never changes
 *  what the detail pane is showing. */
function FolderBranch({
  folderId,
  depth,
  expanded,
  toggle,
  selectedId,
  onSelect,
  selectedFolderId,
  onSelectFolder,
  selectedFileId,
  onSelectFile,
  workflows,
  files,
  edits,
}: {
  folderId: string;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  workflows: Workflow[];
  files: LibraryFile[];
  edits: TreeEdits;
}) {
  const folder = edits.tree.folders.find((f) => f.id === folderId);
  if (!folder) return null;
  const kids = childFolders(edits.tree.folders, folderId);
  const flows = workflows.filter((a) => a.folderId === folderId);
  const docs = files.filter((f) => f.folderId === folderId);
  const open = expanded.has(folderId);
  const node: LibraryNode = { kind: "folder", id: folderId };
  return (
    <>
      <TreeRow
        depth={depth}
        icon={open ? <FolderOpen size={14} strokeWidth={1.8} /> : <FolderIcon size={14} strokeWidth={1.8} />}
        label={folder.name}
        active={folderId === selectedFolderId}
        hasChildren={kids.length > 0 || flows.length > 0 || docs.length > 0}
        open={open}
        onToggle={() => toggle(folderId)}
        onSelect={() => onSelectFolder(folderId)}
        renaming={edits.renamingId === folderId}
        onRename={(name) => edits.commitRename(node, name)}
        onCancelRename={edits.cancelRename}
        menu={edits.editable ? (control) => <RowMenu node={node} edits={edits} control={control} /> : undefined}
      />
      {/* Mounted whether or not it's open, so closing animates too — <Reveal>
          makes the closed subtree inert so nothing in it is tabbable. */}
      <Reveal open={open}>
        <>
          {kids.map((k) => (
            <FolderBranch
              key={k.id}
              folderId={k.id}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              workflows={workflows}
              files={files}
              edits={edits}
            />
          ))}
          {flows.map((a) => (
            <WorkflowLeaf
              key={a.id}
              workflow={a}
              depth={depth + 1}
              active={a.id === selectedId}
              onSelect={() => onSelect(a.id)}
              edits={edits}
            />
          ))}
          {docs.map((f) => (
            <FileLeaf
              key={f.id}
              file={f}
              depth={depth + 1}
              active={f.id === selectedFileId}
              onSelect={() => onSelectFile(f.id)}
              edits={edits}
            />
          ))}
        </>
      </Reveal>
    </>
  );
}

/* --------------------------------------------------- merged library (nav + list) */

/** The workflow library: a single left panel that merges the Public/Private
 *  folder tree with the workflows and files inside each folder (as selectable
 *  leaves), so navigation and selection live in one column instead of two. While
 *  the workspace header narrows the page (a search or a filter), the tree flattens
 *  to the matches — the folders are structure, not a second filter. */
function WorkflowLibrary({
  workflows,
  files,
  narrowed,
  selectedId,
  onSelect,
  selectedFolderId,
  onSelectFolder,
  selectedFileId,
  onSelectFile,
}: {
  workflows: Workflow[];
  files: LibraryFile[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
}) {
  const store = useStore();
  const tree: LibraryTree = { folders: store.folders, workflows: store.workflows, files: store.files };

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set<string>(["vis:public", "vis:private", ...store.folders.map((f) => f.id)]),
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // A refused edit says why, in the tree it was refused in. It clears on the next
  // edit rather than on a timer — a message that vanishes while you're reading it
  // is a message you have to reproduce to read.
  const [refusal, setRefusal] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const reveal = (id: string) => setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  // Opening a folder also reveals it: a collapsed folder whose detail is on screen
  // would leave the tree contradicting the pane. It never collapses one — the
  // chevron is the only control that closes a branch.
  const selectFolder = (id: string) => {
    reveal(id);
    onSelectFolder(id);
  };

  const edits: TreeEdits = {
    tree,
    editable: store.allowed("author"),
    renamingId,
    startRename: (id) => {
      setRefusal(null);
      setRenamingId(id);
    },
    cancelRename: () => setRenamingId(null),
    commitRename: (node, name) => {
      const reason = store.renameNode(node, name);
      setRefusal(reason);
      // Stay in the field when the name was refused — otherwise the correction
      // costs another trip through the menu.
      if (reason === null) setRenamingId(null);
    },
    move: (node, target) => {
      const reason = store.moveNode(node, target);
      setRefusal(reason);
      if (reason === null && target.kind === "folder") reveal(target.id);
    },
    remove: (node) => setRefusal(store.deleteNode(node)),
    createFolder: (target) => {
      setRefusal(null);
      const made = store.newFolder(target);
      if ("reason" in made) return setRefusal(made.reason);
      if (target.kind === "folder") reveal(target.id);
      onSelectFolder(made.id);
      setRenamingId(made.id);
    },
    createFile: (folderId, extension) => {
      setRefusal(null);
      const made = store.newFile(folderId, extension);
      if ("reason" in made) return setRefusal(made.reason);
      reveal(folderId);
      onSelectFile(made.id);
      setRenamingId(made.id);
    },
    countUnder: store.countUnder,
  };

  const roots: { visibility: Visibility; label: string; icon: ReactNode }[] = [
    { visibility: "public", label: "Public", icon: <Globe size={14} strokeWidth={1.8} /> },
    { visibility: "private", label: "Private", icon: <Lock size={14} strokeWidth={1.8} /> },
  ];

  return (
    <Pane width={PANE_WIDTH.list}>
      {refusal && (
        <div
          role="alert"
          className="m-2 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[0.72rem] leading-snug"
          style={{ background: "var(--tomato-a3)", color: "var(--tomato-a11)" }}
        >
          <span className="min-w-0 flex-1">{refusal}</span>
          <button
            type="button"
            onClick={() => setRefusal(null)}
            aria-label="Dismiss"
            className="focusable shrink-0 rounded"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      )}
      {/* A landmark, because this column is the page's navigation: the breadcrumb
          names the same folders, and without a region to scope to, "Onboarding"
          means two different controls. */}
      <nav aria-label="Library tree" className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {narrowed ? (
          workflows.length === 0 && files.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
              Nothing matches the current search or filters.
            </p>
          ) : (
            <>
              {workflows.map((a) => (
                <WorkflowLeaf
                  key={a.id}
                  workflow={a}
                  depth={0}
                  active={a.id === selectedId}
                  onSelect={() => onSelect(a.id)}
                  edits={edits}
                />
              ))}
              {files.map((f) => (
                <FileLeaf
                  key={f.id}
                  file={f}
                  depth={0}
                  active={f.id === selectedFileId}
                  onSelect={() => onSelectFile(f.id)}
                  edits={edits}
                />
              ))}
            </>
          )
        ) : (
          roots.map((root) => {
            const visKey = `vis:${root.visibility}`;
            const open = expanded.has(visKey);
            const topFolders = childFolders(store.folders, null, root.visibility);
            return (
              <div key={root.visibility} className="mb-1">
                {/* Public/Private are section headers, not folders — nothing lives
                    in them directly, so they expand rather than open. The one edit
                    they carry is making a folder at the top of their tree. */}
                <TreeRow
                  depth={0}
                  icon={root.icon}
                  label={root.label}
                  active={false}
                  hasChildren={topFolders.length > 0}
                  open={open}
                  onToggle={() => toggle(visKey)}
                  onSelect={() => toggle(visKey)}
                  menu={
                    edits.editable
                      ? (control) => (
                      <ActionMenu
                        label={`Actions for ${root.label}`}
                        align="right"
                        open={control.open}
                        onOpenChange={control.setOpen}
                        trigger={<MoreHorizontal size={15} strokeWidth={2} />}
                        panel={() => ({
                          items: [
                            {
                              id: "new-folder",
                              label: "New folder",
                              icon: <FolderPlus size={14} strokeWidth={1.8} />,
                              onSelect: () => edits.createFolder({ kind: "root", visibility: root.visibility }),
                            },
                          ],
                        })}
                      />
                        )
                      : undefined
                  }
                />
                <Reveal open={open}>
                  {topFolders.map((f) => (
                    <FolderBranch
                      key={f.id}
                      folderId={f.id}
                      depth={1}
                      expanded={expanded}
                      toggle={toggle}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      selectedFolderId={selectedFolderId}
                      onSelectFolder={selectFolder}
                      selectedFileId={selectedFileId}
                      onSelectFile={onSelectFile}
                      workflows={workflows}
                      files={files}
                      edits={edits}
                    />
                  ))}
                </Reveal>
              </div>
            );
          })
        )}
      </nav>
    </Pane>
  );
}

/* ---------------------------------------------------------------------- detail */

const DETAIL_TABS = ["History", "Versions", "Dependencies"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

function WorkflowDetail({ workflow, onSelectWorkflow }: { workflow: Workflow; onSelectWorkflow: (id: string) => void }) {
  const { memberById, runsForWorkflow, workflowById, editWorkflow, reviewWorkflow, role, allowed, selectFolder, folders } =
    useStore();
  const [tab, setTab] = useState<DetailTab>("History");
  const owner = memberById(workflow.ownerId);
  const runs = runsForWorkflow(workflow.id);

  return (
    <>
      {/* Tabbed pane — primary detail */}
      <DetailPane>
        <TabStrip
          ariaLabel="Workflow detail"
          segments={DETAIL_TABS.map((t) => ({
          id: t,
          label: t,
          badge: t === "History" ? runs.length : t === "Versions" ? workflow.versions.length : undefined,
        }))}
          value={tab}
          onChange={(id) => setTab(id as DetailTab)}
        />

        {tab === "History" ? (
          <div key="history" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-4 py-3">
            {runs.length === 0 ? (
              <p className="py-16 text-center text-body-sm text-tertiary-foreground">No runs recorded yet.</p>
            ) : (
              runs.map((r) => <RunRow key={r.id} run={r} />)
            )}
          </div>
        ) : tab === "Versions" ? (
          <div key="versions" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-xl flex-col gap-4">
              {hasUnpublishedChanges(workflow.versions) && publishedVersion(workflow.versions) && (
                <p className="rounded-xl px-3 py-2 text-body-sm" style={{ background: "var(--amber-a3)", color: "var(--amber-a11)" }}>
                  Edited since it was last published. v{publishedVersion(workflow.versions)!.version} is what
                  runs; the newer version carries no approval yet.
                </p>
              )}
              <ol className="flex flex-col rounded-xl border-border-default border-[0.5px] bg-page px-4 shadow-default">
                {[...workflow.versions].reverse().map((v, i, all) => (
                  <li
                    key={v.version}
                    className={"flex items-center gap-3 py-3 border-border-default " + (i < all.length - 1 ? "border-b-[0.5px]" : "")}
                  >
                    <span className="w-8 shrink-0 font-departure-mono text-[0.7rem] text-tertiary-foreground">
                      v{v.version}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-body-sm text-primary-foreground">{v.summary}</span>
                      <span className="truncate text-[0.72rem] text-tertiary-foreground">
                        {v.authoredBy} · {v.authoredAt}
                        {v.approvedBy ? ` · approved by ${v.approvedBy}` : ""}
                      </span>
                    </div>
                    {v.publishedAt && <Chip tone="grass" mono>published</Chip>}
                    {!v.publishedAt && v.approvedBy && <Chip tone="cyan" mono>approved</Chip>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <div key="deps" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-xl flex-col gap-8">
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-body-base font-medium text-primary-foreground">Packages</h3>
                  <span className="text-body-sm text-tertiary-foreground">
                    Derived from the {workflow.steps.length} step{workflow.steps.length === 1 ? "" : "s"} in the flow.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workflow.packages.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-component px-2.5 py-1 font-departure-mono text-[0.72rem] text-secondary-foreground"
                    >
                      <Package size={13} strokeWidth={1.8} className="text-tertiary-foreground" />
                      {p}
                    </span>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-body-base font-medium text-primary-foreground">References</h3>
                {workflow.references.length === 0 ? (
                  <p className="text-body-sm text-tertiary-foreground">This workflow references no others.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {workflow.references.map((rid) => {
                      const ref = workflowById(rid);
                      if (!ref) return null;
                      return (
                        <button
                          key={rid}
                          type="button"
                          onClick={() => onSelectWorkflow(rid)}
                          className="focusable flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-transparent-hover"
                        >
                          <Link2 size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
                          <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{ref.name}</span>
                          <ArrowUpRight size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </DetailPane>

      {/* Summary — collapsible context pane */}
      <ContextPane>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4">
            <div
              className="flex size-12 items-center justify-center rounded-xl"
              style={{ background: "var(--violet-a3)", color: "var(--violet-a11)" }}
            >
              <WorkflowIcon size={22} strokeWidth={1.7} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">{workflow.id}</span>
              <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{workflow.name}</h2>
              <p className="text-body-base text-secondary-foreground">{workflow.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="solid" className="w-fit">
                <Play size={14} strokeWidth={2} />
                Run now
              </Button>
              {/* Only a natively-authored flow can be opened here; a mirrored one
                  lives on its own platform. */}
              {allowed("author") && workflow.platform === "conduit" && (
                <Button
                  variant="outlined"
                  onClick={() => editWorkflow(workflow.id)}
                  className="w-fit"
                >
                  <Pencil size={14} strokeWidth={1.8} />
                  Edit flow
                </Button>
              )}
              {/* The lifecycle moves this tier may make from here — the same table
                  the Review queue and the store are built from, so an author sees
                  "Submit for review" and never sees "Approve". */}
              {availableTransitions(role, workflow.status).map((t) => (
                <Button key={t.action} variant="outlined" onClick={() => reviewWorkflow(workflow.id, t.action)} className="w-fit">
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Status">
              <WorkflowStatusChip status={workflow.status} />
            </MetaRow>
            <MetaRow label="Runs on">
              <span className="inline-flex items-center gap-1.5">
                {PLATFORM_LABEL[workflow.platform]}
                {workflow.platform !== "conduit" && (
                  <span className="text-tertiary-foreground">· authored there, mirrored here</span>
                )}
              </span>
            </MetaRow>
            <MetaRow label="Migration">{workflow.migration}</MetaRow>
            <MetaRow label="Needs">{explainRequirements(workflow.requirements)}</MetaRow>
            <MetaRow label="Owner">
              <span className="inline-flex items-center gap-1.5">
                {owner && <Avatar member={owner} size={18} />}
                {owner?.name}
              </span>
            </MetaRow>
            <MetaRow label="Visibility">
              <span className="inline-flex items-center gap-1.5 capitalize">
                {workflow.visibility === "public" ? (
                  <Globe size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                ) : (
                  <Lock size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                )}
                {workflow.visibility}
              </span>
            </MetaRow>
            <MetaRow label="Folder">
              {/* The same destination the tree opens — a workflow's location is a
                  place you can go, not a label. */}
              <button
                type="button"
                onClick={() => selectFolder(workflow.folderId)}
                className="focusable -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:text-primary-foreground"
              >
                <FolderIcon size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
                <span className="truncate">{folderPath(folders, workflow.folderId)}</span>
              </button>
            </MetaRow>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Total runs">
              <span>{num(workflow.runCount)}</span>
            </MetaRow>
            <MetaRow label="Success rate">
              <span>{pct(workflow.successRate)}</span>
            </MetaRow>
            <MetaRow label="Last run">
              <span>{workflow.lastRunAt}</span>
            </MetaRow>
            <MetaRow label="Updated">
              <span>{workflow.updatedAgo}</span>
            </MetaRow>
          </div>
        </div>
      </ContextPane>
    </>
  );
}

/* ----------------------------------------------------------------- folder detail */

/** One row in a folder's contents — a subfolder or a workflow, both of which open
 *  the way their tree row does, so the pane navigates like the tree it mirrors. */
function ContentRow({
  icon,
  title,
  sub,
  trailing,
  onOpen,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  trailing?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-transparent-hover"
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-tertiary-foreground">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-body-sm text-primary-foreground">{title}</span>
        <span className="truncate text-[0.72rem] text-tertiary-foreground">{sub}</span>
      </div>
      {trailing}
    </button>
  );
}

/** The detail for an opened folder: what it holds, and what that adds up to.
 *
 *  It counts the whole subtree, not the direct contents — a folder holding only
 *  subfolders still holds work, and a count that says "0" over five nested
 *  workflows would be a lie. The rows below stay direct, so the pane mirrors the
 *  branch you clicked rather than flattening it.
 *
 *  Contents are drawn from the same narrowed set the tree draws from, so a search
 *  narrows both together; the pane says so rather than reporting a partial count
 *  as the folder's size. */
function FolderDetail({
  folder,
  workflows,
  files,
  narrowed,
  onSelectFolder,
  onSelectWorkflow,
  onSelectFile,
}: {
  folder: Folder;
  workflows: Workflow[];
  files: LibraryFile[];
  narrowed: boolean;
  onSelectFolder: (id: string) => void;
  onSelectWorkflow: (id: string) => void;
  onSelectFile: (id: string) => void;
}) {
  const { memberById, folders } = useStore();
  const subtree = workflowsUnder(workflows, folders, folder.id);
  const here = workflows.filter((w) => w.folderId === folder.id);
  const inSubtree = new Set(subtreeIds(folders, folder.id));
  const filesUnder = files.filter((f) => inSubtree.has(f.folderId));
  const filesHere = files.filter((f) => f.folderId === folder.id);
  const subfolders = childFolders(folders, folder.id);
  const runCount = subtree.reduce((n, w) => n + w.runCount, 0);
  // Weighted by runs: an workflow that ran twice shouldn't move the folder's rate
  // as far as one that ran a thousand times.
  const successRate =
    runCount === 0 ? null : subtree.reduce((n, w) => n + w.runCount * w.successRate, 0) / runCount;
  const published = subtree.filter((w) => w.status === "Published").length;
  const platforms = [...new Set(subtree.map((w) => w.platform))];
  const parentPath = folder.parentId ? folderPath(folders, folder.parentId) : null;

  return (
    <>
      <DetailPane>
        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-8">
            {narrowed && (
              <p className="rounded-xl px-3 py-2 text-body-sm" style={{ background: "var(--amber-a3)", color: "var(--amber-a11)" }}>
                Narrowed by the current search or filters — this counts the matches in this folder,
                not everything it holds.
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              <StatTile
                label="Workflows"
                value={num(subtree.length)}
                sub={
                  subtree.length === here.length
                    ? "all directly here"
                    : `${here.length} here · ${subtree.length - here.length} in subfolders`
                }
              />
              <StatTile label="Published" value={num(published)} sub={`of ${subtree.length}`} />
              <StatTile
                label="Runs"
                value={num(runCount)}
                sub={successRate === null ? "never run" : `${pct(successRate)} success`}
              />
            </div>

            {subfolders.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-body-base font-medium text-primary-foreground">Subfolders</h3>
                <div className="flex flex-col gap-1">
                  {subfolders.map((sub) => {
                    const count = workflowsUnder(workflows, folders, sub.id).length;
                    return (
                      <ContentRow
                        key={sub.id}
                        icon={<FolderIcon size={14} strokeWidth={1.8} />}
                        title={sub.name}
                        sub={`${count} workflow${count === 1 ? "" : "s"}`}
                        trailing={<ArrowUpRight size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />}
                        onOpen={() => onSelectFolder(sub.id)}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-body-base font-medium text-primary-foreground">Workflows</h3>
                <span className="text-body-sm text-tertiary-foreground">
                  {here.length === 0 ? "Nothing lives directly in this folder." : "Living directly in this folder."}
                </span>
              </div>
              {here.length > 0 && (
                <div className="flex flex-col gap-1">
                  {here.map((w) => {
                    const owner = memberById(w.ownerId);
                    // A mirrored workflow carries no edit time of ours ("—"), so the
                    // line drops the clause rather than printing "updated —".
                    const updated = minutesAgo(w.updatedAgo) === null ? null : `updated ${w.updatedAgo}`;
                    return (
                      <ContentRow
                        key={w.id}
                        icon={<span style={{ color: WORKFLOW_ROW_ICON.tone }}>{WORKFLOW_ROW_ICON.icon}</span>}
                        title={w.name}
                        sub={[PLATFORM_LABEL[w.platform], updated].filter(Boolean).join(" · ")}
                        trailing={
                          <span className="flex shrink-0 items-center gap-2">
                            <WorkflowStatusChip status={w.status} />
                            {owner && <Avatar member={owner} size={18} />}
                          </span>
                        }
                        onOpen={() => onSelectWorkflow(w.id)}
                      />
                    );
                  })}
                </div>
              )}
            </section>

            {filesHere.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-body-base font-medium text-primary-foreground">Files</h3>
                  <span className="text-body-sm text-tertiary-foreground">
                    Configs and documents filed here. They aren't runnable — they're what the
                    runnable things are configured by and documented in.
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {filesHere.map((f) => {
                    const owner = memberById(f.ownerId);
                    const look = FILE_ICON[kindOfFile(f.name)];
                    return (
                      <ContentRow
                        key={f.id}
                        icon={<span style={{ color: look.tone }}>{look.icon}</span>}
                        title={f.name}
                        sub={`${look.label} · updated ${f.updatedAgo}`}
                        trailing={owner ? <Avatar member={owner} size={18} /> : undefined}
                        onOpen={() => onSelectFile(f.id)}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      </DetailPane>

      <ContextPane>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4">
            <div
              className="flex size-12 items-center justify-center rounded-xl bg-component text-secondary-foreground"
            >
              <FolderIcon size={22} strokeWidth={1.7} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">{folder.id}</span>
              <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{folder.name}</h2>
              <p className="text-body-base text-secondary-foreground">
                {folderPath(folders, folder.id)}
              </p>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Visibility">
              <span className="inline-flex items-center gap-1.5 capitalize">
                {folder.visibility === "public" ? (
                  <Globe size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                ) : (
                  <Lock size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                )}
                {folder.visibility}
              </span>
            </MetaRow>
            <MetaRow label="Inside">
              {parentPath ? (
                <button
                  type="button"
                  onClick={() => onSelectFolder(folder.parentId!)}
                  className="focusable -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:text-primary-foreground"
                >
                  <FolderIcon size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
                  <span className="truncate">{parentPath}</span>
                </button>
              ) : (
                <span className="text-tertiary-foreground">Top of the tree</span>
              )}
            </MetaRow>
            <MetaRow label="Subfolders">{num(subfolders.length)}</MetaRow>
            <MetaRow label="Workflows">
              {subtree.length === here.length
                ? num(subtree.length)
                : `${num(subtree.length)} · ${num(here.length)} directly here`}
            </MetaRow>
            <MetaRow label="Files">{num(filesUnder.length)}</MetaRow>
            <MetaRow label="Runs on">
              {platforms.length === 0 ? (
                <span className="text-tertiary-foreground">—</span>
              ) : (
                platforms.map((p) => PLATFORM_LABEL[p]).join(" · ")
              )}
            </MetaRow>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Total runs">
              <span>{num(runCount)}</span>
            </MetaRow>
            <MetaRow label="Success rate">
              <span>{successRate === null ? "—" : pct(successRate)}</span>
            </MetaRow>
            <MetaRow label="Published">
              <span>{`${num(published)} of ${num(subtree.length)}`}</span>
            </MetaRow>
          </div>
        </div>
      </ContextPane>
    </>
  );
}

/* ------------------------------------------------------------------- file detail */

/**
 * The detail for an opened file: its source, and where it sits.
 *
 * Source, not a rendered preview. A config the connector loader actually reads is
 * worth showing as the thing that gets read; a runbook rendered here would be a
 * second markdown implementation to keep honest, and the prototype has nothing to
 * gain from one. An empty file says it's empty rather than showing a blank pane.
 */
function FileDetail({
  file,
  onSelectFolder,
}: {
  file: LibraryFile;
  onSelectFolder: (id: string) => void;
}) {
  const { memberById, folders } = useStore();
  const owner = memberById(file.ownerId);
  const look = FILE_ICON[kindOfFile(file.name)];
  const lines = file.content === "" ? [] : file.content.replace(/\n$/, "").split("\n");

  return (
    <>
      <DetailPane>
        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {lines.length === 0 ? (
              <p className="py-16 text-center text-body-sm text-tertiary-foreground">
                This file is empty.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border-border-default border-[0.5px] bg-page shadow-default">
                <div className="flex items-center gap-2 border-border-default border-b-[0.5px] bg-component px-3 py-2">
                  <span style={{ color: look.tone }}>{look.icon}</span>
                  <span className="truncate font-departure-mono text-[0.72rem] text-secondary-foreground">
                    {file.name}
                  </span>
                  <span className="ml-auto font-departure-mono text-[0.65rem] text-tertiary-foreground">
                    {lines.length} line{lines.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="scrollbar-none overflow-x-auto px-3 py-3">
                  <pre className="font-departure-mono text-[0.72rem] leading-normal text-secondary-foreground">
                    {lines.map((line, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="w-6 shrink-0 select-none text-right text-tertiary-foreground">{i + 1}</span>
                        <span className="whitespace-pre">{line || " "}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </DetailPane>

      <ContextPane>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-component" style={{ color: look.tone }}>
              {look.icon}
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">{file.id}</span>
              <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{file.name}</h2>
              <p className="text-body-base text-secondary-foreground">
                {look.label} · {folderPath(folders, file.folderId)}
              </p>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Type">
              <span className="inline-flex items-center gap-1.5">
                {look.label}
                <Chip tone="gray" mono>
                  .{file.name.slice(file.name.lastIndexOf(".") + 1)}
                </Chip>
              </span>
            </MetaRow>
            <MetaRow label="Owner">
              <span className="inline-flex items-center gap-1.5">
                {owner && <Avatar member={owner} size={18} />}
                {owner?.name}
              </span>
            </MetaRow>
            <MetaRow label="Visibility">
              <span className="inline-flex items-center gap-1.5 capitalize">
                {file.visibility === "public" ? (
                  <Globe size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                ) : (
                  <Lock size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                )}
                {file.visibility}
              </span>
            </MetaRow>
            <MetaRow label="Folder">
              <button
                type="button"
                onClick={() => onSelectFolder(file.folderId)}
                className="focusable -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:text-primary-foreground"
              >
                <FolderIcon size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
                <span className="truncate">{folderPath(folders, file.folderId)}</span>
              </button>
            </MetaRow>
            <MetaRow label="Updated">{file.updatedAgo}</MetaRow>
            <MetaRow label="Lines">{num(lines.length)}</MetaRow>
          </div>
        </div>
      </ContextPane>
    </>
  );
}

/* ------------------------------------------------------------------------ view */

/* ------------------------------------------------------------------- board mode */

const BOARD_STATUSES: WorkflowStatus[] = [...WORKFLOW_STATUSES];

/** Board presentation: workflows laid out in columns by lifecycle status.
 *  Selecting a card returns to the list focused on that workflow — mirroring the
 *  inbox board → detail flow. */
function WorkflowsBoard({ items, onSelect }: { items: Workflow[]; onSelect: (id: string) => void }) {
  const { memberById } = useStore();
  const columns = useMemo(() => {
    const by = new Map<WorkflowStatus, Workflow[]>();
    for (const a of items) {
      const arr = by.get(a.status) ?? [];
      arr.push(a);
      by.set(a.status, arr);
    }
    return BOARD_STATUSES.map((status) => ({ status, items: by.get(status) ?? [] }));
  }, [items]);

  return (
    <DetailPane>
      <div
        className="scrollbar-none flex min-w-0 flex-1 gap-5 overflow-x-auto p-5"
        style={{ background: "color-mix(in srgb, var(--color-primary-foreground) 3%, transparent)" }}
      >
        {columns.map((col) => {
          const accent = WORKFLOW_STATUS_ACCENT[col.status];
          return (
            <section key={col.status} className="flex w-72 shrink-0 flex-col">
              <header className="flex items-center gap-2 px-1 pb-3">
                <span className="size-2.5 shrink-0 rounded-[4px]" style={{ background: `var(--${accent}-9)` }} />
                <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-secondary-foreground">
                  {col.status}
                </span>
                <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{col.items.length}</span>
              </header>
              <div className="flex flex-col gap-2.5">
                {col.items.map((a) => {
                  const owner = memberById(a.ownerId);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onSelect(a.id)}
                      className="pressable focusable flex w-full flex-col gap-2.5 rounded-xl border-border-default border-[0.5px] bg-page p-3 text-left shadow-default transition-colors hover:border-border-strong"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
                          {a.id}
                        </span>
                        {owner && (
                          <span className="ml-auto">
                            <Avatar member={owner} size={18} />
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 text-body-sm font-medium leading-5 text-primary-foreground line-clamp-2">
                        {a.name}
                      </span>
                      <span className="text-[0.72rem] text-tertiary-foreground">
                        {pct(a.successRate)} success · {a.lastRunAt}
                      </span>
                    </button>
                  );
                })}
                {col.items.length === 0 && (
                  <p className="px-1 py-4 text-body-sm text-tertiary-foreground">None.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </DetailPane>
  );
}

/** Workflows — the first-class workflow library. List mode is the shared shell
 *  with one merged left panel (the Public/Private folder tree and the workflows
 *  inside each folder together) → run-history / dependencies detail → collapsible
 *  summary. Board mode fills the panel with a status board (like the inbox board).
 *  Failed runs link back to the incidents they spawned. */
export function WorkflowsView() {
  const {
    workflows,
    folders,
    files,
    viewMode,
    selectedWorkflowId,
    selectWorkflow,
    selectedFolderId,
    selectFolder,
    selectedFileId,
    selectFile,
    controls,
  } = useStore();
  const state = controls("workflows");
  const narrowed = isNarrowed(state);
  const visible = visibleWorkflows(workflows, state);
  const visibleFiles = narrowedFiles(files, state);
  const selected = selectedWorkflowId
    ? workflows.find((a) => a.id === selectedWorkflowId) ?? null
    : null;
  const selectedFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) ?? null : null;
  const selectedFile = selectedFileId ? files.find((f) => f.id === selectedFileId) ?? null : null;

  // Board layout: the status board fills the panel; opening an workflow shows its
  // detail (the board is hidden) — deselect via the breadcrumb returns to the board.
  if (viewMode("workflows") === "board") {
    return (
      <SplitView>
        {selected ? (
          <WorkflowDetail workflow={selected} onSelectWorkflow={selectWorkflow} />
        ) : (
          <WorkflowsBoard items={visible} onSelect={selectWorkflow} />
        )}
      </SplitView>
    );
  }

  return (
    <SplitView>
      <WorkflowLibrary
        workflows={visible}
        files={visibleFiles}
        narrowed={narrowed}
        selectedId={selectedWorkflowId}
        onSelect={selectWorkflow}
        selectedFolderId={selectedFolderId}
        onSelectFolder={selectFolder}
        selectedFileId={selectedFileId}
        onSelectFile={selectFile}
      />
      {selected ? (
        <WorkflowDetail workflow={selected} onSelectWorkflow={selectWorkflow} />
      ) : selectedFolder ? (
        <FolderDetail
          folder={selectedFolder}
          workflows={visible}
          files={visibleFiles}
          narrowed={narrowed}
          onSelectFolder={selectFolder}
          onSelectWorkflow={selectWorkflow}
          onSelectFile={selectFile}
        />
      ) : selectedFile ? (
        <FileDetail file={selectedFile} onSelectFolder={selectFolder} />
      ) : (
        <EmptyDetail>Select a workflow, a folder, or a file.</EmptyDetail>
      )}
    </SplitView>
  );
}
