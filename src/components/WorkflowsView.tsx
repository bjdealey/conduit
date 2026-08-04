import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
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
  Info,
  Layers,
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
import { densityVars } from "../data/libraryView";
import type { FileKind, Folder, LibraryFile, Workflow, WorkflowStatus, Visibility } from "../data/types";
import { Avatar } from "./Avatar";
import { Chip } from "./Chip";
import { WORKFLOW_STATUS_ACCENT, WorkflowStatusChip } from "./Badges";
import { RunRow } from "./RunRow";
import { minutesAgo, num } from "../lib/format";
import { childFolders, folderPath, subtreeIds, workflowsUnder } from "../lib/folders";
import { shortcutFor } from "../lib/keys";
import {
  kindOfFile,
  moveTargets,
  readOnlyReason,
  sharedMoveTargets,
  type LibraryNode,
  type LibraryTree,
  type MoveTarget,
} from "../lib/library";
import { narrowTree, rowAfter, rowMatching, visibleRows, type TreeRowInfo, type TreeSlice } from "../lib/tree";
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

/**
 * Everything a tree row needs that isn't its own content, threaded down as one
 * object so adding a capability doesn't mean adding a prop to every level.
 *
 * It carries two trees on purpose. `tree` is the whole library and is what the
 * edit rules read — a rename has to see a sibling the current search is hiding,
 * or it would allow a collision. `slice` is what's on screen.
 */
type TreeCtx = {
  tree: LibraryTree;
  /** Which nodes the current search leaves showing, or undefined for all of them. */
  slice?: TreeSlice;
  /** Whether the signed-in tier may edit the library at all. */
  editable: boolean;
  /** Whether the tree is being read on a phone — where there is no hover to
   *  reveal a row's controls with, and a tap on a row is the way into it. */
  isMobile: boolean;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  renamingId: string | null;
  startRename: (id: string) => void;
  cancelRename: () => void;
  commitRename: (node: LibraryNode, name: string) => void;
  move: (node: LibraryNode, target: MoveTarget) => void;
  remove: (node: LibraryNode) => void;
  moveMany: (nodes: LibraryNode[], target: MoveTarget) => void;
  removeMany: (nodes: LibraryNode[]) => void;
  countUnderAll: (nodes: LibraryNode[]) => { folders: number; workflows: number; files: number };
  createFolder: (target: MoveTarget) => void;
  createFile: (folderId: string, extension: string) => void;
  newWorkflowIn: (folderId: string) => void;
  countUnder: (node: LibraryNode) => { folders: number; workflows: number; files: number };
  /** The multi-selection: what a bulk action would act on. Distinct from what the
   *  detail pane is showing, so the info button can open a row without disturbing
   *  a selection that took several clicks to build. */
  selection: LibraryNode[];
  isSelected: (id: string) => boolean;
  /** A click on a row, carrying its modifiers: plain replaces the selection,
   *  ctrl/cmd toggles one row, shift takes the range from the anchor. */
  clickRow: (id: string, modifiers: { meta: boolean; shift: boolean }) => void;
  /** Open a node in the detail pane without touching the selection. */
  peek: (node: LibraryNode) => void;
  /** The hovered row, held here rather than per-row so it is single by
   *  construction: two rows cannot each believe they are hovered, which is what
   *  made two of them light up at once. */
  hoveredId: string | null;
  hoverRow: (id: string) => void;
  unhoverRow: (id: string) => void;
  /** The keyboard cursor — exactly one row is tabbable at a time. */
  cursorId: string | null;
  /** Whether focus is inside the tree. The cursor row only reveals its menu when
   *  it is: otherwise the selected row would permanently swap its status and
   *  owner for a "…" nobody is reaching for, and two rows would read as
   *  interacted-with at once. */
  treeFocused: boolean;
  setCursor: (id: string) => void;
  /** One menu is open at a time, which is also what a menu *should* mean. */
  menuFor: { id: string; panel: string } | null;
  openMenu: (id: string, panel?: string) => void;
  closeMenu: () => void;
  /** Drag state: what's moving, where it may land, and what it's over. */
  dragging: LibraryNode | null;
  dropIds: Set<string>;
  dropOn: string | null;
  onDragStart: (node: LibraryNode) => void;
  onDragEnd: () => void;
  onDragOver: (rowId: string) => void;
  onDrop: (rowId: string) => void;
};

/**
 * One row of the tree.
 *
 * The row itself is the `treeitem` and the only focusable thing in it: the
 * chevron and the "…" button are `tabIndex={-1}`, reachable by pointer and by
 * the tree's own keys. That is what makes the whole tree a single tab stop
 * instead of the ~75 it used to be, and it is the shape screen readers expect —
 * `aria-expanded` on the row already says what the chevron says.
 */
function TreeRow({
  id,
  ctx,
  depth,
  icon,
  iconTone,
  label,
  sublabel,
  active,
  expandable,
  open,
  node,
  onSelect,
  trailing,
  menu,
  info,
  droppable = false,
}: {
  id: string;
  ctx: TreeCtx;
  depth: number;
  icon: ReactNode;
  /** Colour for the icon only — never the sole carrier of what a row is. */
  iconTone?: string;
  label: string;
  /** A second line under the name — the folder path, in the flat layout. */
  sublabel?: string;
  active: boolean;
  expandable: boolean;
  open: boolean;
  /** The library node this row stands for; absent for the section headers. */
  node?: LibraryNode;
  onSelect: () => void;
  trailing?: ReactNode;
  menu?: ReactNode;
  /** Opens this row in the detail pane without changing the selection. */
  info?: ReactNode;
  /** Whether a drag may land here (folders and the section headers). */
  droppable?: boolean;
}) {
  const hovered = ctx.hoveredId === id;
  const renaming = ctx.renamingId === id;
  const menuOpen = ctx.menuFor?.id === id;
  // The pointer wins over the keyboard cursor when both are in play: whatever is
  // under the mouse is the thing you are about to act on. With no pointer in the
  // tree, the focused cursor row shows it instead, so the keyboard is never left
  // without the affordance.
  const revealed =
    menuOpen || (ctx.hoveredId ? hovered : ctx.treeFocused && ctx.cursorId === id);
  const isDropTarget = droppable && ctx.dragging !== null && ctx.dropIds.has(id);
  const isOver = isDropTarget && ctx.dropOn === id;
  const dragged = ctx.dragging !== null && node !== undefined && ctx.dragging.id === node.id;

  // Selection and hover must never look the same, or two rows read as hovered at
  // once — one because the pointer is on it, one because it is open. Hover is the
  // faint fill; selection is a stronger fill *plus* a brand bar down its leading
  // edge. The bar is what actually carries it: the two fills differ by 6% in light
  // mode but only 2% in dark, so tone alone would be a distinction that quietly
  // disappears for half the users.
  //
  // An open menu reads as hover, not as selection: the panel is portalled out of
  // the row, so the pointer leaves the row the moment it reaches the menu, and
  // without this the highlight drops off the one row you are demonstrably acting
  // on. Hover and an open menu can't be on different rows anyway — the menu's
  // dismissal overlay covers the tree while it is open.
  // Two independent facts, composed rather than ranked: `selected` is what a bulk
  // action would touch (the fill), `active` is what the detail pane is showing
  // (the leading bar). A plain click sets both, so the ordinary single-selection
  // case looks exactly as it did; the info button sets only the second, and a
  // ctrl-click only the first.
  const selected = node !== undefined && ctx.isSelected(id);
  const background = isOver
    ? "var(--blue-a3)"
    : selected
      ? "var(--color-component-active)"
      : hovered || menuOpen
        ? "var(--color-transparent-hover)"
        : undefined;

  return (
    <div
      role="treeitem"
      aria-label={label}
      aria-level={depth + 1}
      aria-selected={node !== undefined ? selected : undefined}
      aria-current={active ? "true" : undefined}
      aria-expanded={expandable ? open : undefined}
      tabIndex={ctx.cursorId === id ? 0 : -1}
      data-tree-row={id}
      draggable={node !== undefined && ctx.editable && !readOnlyReason(ctx.tree, node)}
      onDragStart={(e) => {
        if (!node) return;
        // Firefox refuses to start a drag with no payload.
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
        ctx.onDragStart(node);
      }}
      onDragEnd={ctx.onDragEnd}
      onDragOver={(e) => {
        if (!isDropTarget) return;
        // Only a preventDefault here makes this a drop target at all.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        ctx.onDragOver(id);
      }}
      onDrop={(e) => {
        if (!isDropTarget) return;
        e.preventDefault();
        ctx.onDrop(id);
      }}
      onMouseEnter={() => ctx.hoverRow(id)}
      // Only clear if this row is still the hovered one — leave/enter can arrive
      // in either order when the pointer crosses a boundary.
      onMouseLeave={() => ctx.unhoverRow(id)}
      onClick={(e) => {
        ctx.setCursor(id);
        if (node && (e.metaKey || e.ctrlKey || e.shiftKey)) {
          // A modifier-click is about the selection, never about opening or
          // toggling: shift-clicking a folder to extend a range must not also
          // collapse it.
          ctx.clickRow(id, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey });
          return;
        }
        if (node) ctx.clickRow(id, { meta: false, shift: false });
        onSelect();
      }}
      onContextMenu={(e) => {
        if (!menu) return;
        e.preventDefault();
        ctx.setCursor(id);
        ctx.openMenu(id);
      }}
      className="tree-row flex w-full items-center gap-1 rounded-lg pr-1 text-left transition-colors"
      style={
        {
          // Both read `--tree-indent` so the row and its guide lines move
          // together when the density changes; the height comes from the same
          // place (see `.tree-row` in app.css).
          paddingLeft: `calc(6px + ${depth} * var(--tree-indent, 14px))`,
          // The ancestor count, which is what the guides are drawn from.
          "--row-depth": String(depth),
          // `backgroundColor`, never the `background` shorthand: the shorthand
          // resets `background-image`, which is where the indent guides live.
          backgroundColor: background,
          opacity: dragged ? 0.4 : 1,
          // The row's inset decoration, whichever it currently wants: a legal drop
          // destination outlines itself the moment a drag starts, so where
          // something *can* go is visible before you go hunting for it; otherwise
          // the selected row carries its leading bar. It goes through a custom
          // property rather than `boxShadow` so the focus ring (also a box-shadow,
          // see `.tree-row` in app.css) composes with it instead of one silently
          // replacing the other.
          "--row-ring": isDropTarget && !isOver
            ? "inset 0 0 0 1px var(--blue-a6)"
            : active
              ? "inset 2px 0 0 0 var(--color-brand-solid)"
              : undefined,
        } as CSSProperties
      }
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          ctx.toggle(id);
        }}
        className="tree-chevron flex size-4 shrink-0 items-center justify-center rounded text-tertiary-foreground transition-colors hover:text-primary-foreground"
        style={{ visibility: expandable ? "visible" : "hidden" }}
      >
        <ChevronRight size={13} strokeWidth={2} style={{ transform: open ? "rotate(90deg)" : "none" }} />
      </button>

      {/* The label block's own padding is part of the density: the row height is a
          minimum, so at Compact a fixed 4px would put the natural height above the
          floor and the setting would do nothing. */}
      <span className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingBlock: "var(--tree-row-py, 4px)" }}>
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: 16, height: 16, color: iconTone ?? "var(--color-tertiary-foreground)" }}
        >
          {icon}
        </span>
        {renaming && node ? (
          <RenameField
            value={label}
            onCommit={(name) => ctx.commitRename(node, name)}
            onCancel={ctx.cancelRename}
          />
        ) : sublabel ? (
          // The flat list's second line. Where a row lives is half of what you
          // need to know about it — the same reason every breadcrumb carries the
          // folder trail — and a layout with no folder rows has nowhere else to
          // say it. It costs the row a line, which is what a flat list costs.
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-body-sm text-primary-foreground">{label}</span>
            <span className="truncate text-[0.7rem] text-tertiary-foreground">{sublabel}</span>
          </span>
        ) : (
          <span className="truncate text-body-sm text-primary-foreground">{label}</span>
        )}
      </span>

      {!renaming && (trailing || menu) && (
        // The menu takes the metadata's slot rather than a column of its own: a
        // reserved ellipsis on every row would cost the names ~30px of a 20rem
        // pane, and the status and owner are worth more at rest than an action
        // nobody is reaching for yet. Reaching for it swaps them.
        <span className="flex shrink-0 items-center gap-1.5 pr-0.5">
          {/* A touch screen has nothing to reveal *on*, so a phone shows the
              metadata and the menu together rather than swapping one for the
              other. The peek button isn't among them: it exists to open a row
              without disturbing a multi-selection, and on a phone the tap on the
              row is the way in. */}
          {ctx.isMobile ? (
            <>
              {trailing}
              {menu}
            </>
          ) : revealed && menu ? (
            <>
              {info}
              {menu}
            </>
          ) : (
            trailing
          )}
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
        // The tree's own keys must not fire while a name is being typed.
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

const targetLabel = (tree: LibraryTree, target: MoveTarget) =>
  target.kind === "root"
    ? `Top of ${target.visibility === "public" ? "Public" : "Private"}`
    : tree.folders.find((f) => f.id === target.id)?.name ?? target.id;

/** The name a node shows in a menu heading. */
function nodeLabel(tree: LibraryTree, node: LibraryNode): string {
  if (node.kind === "folder") return tree.folders.find((f) => f.id === node.id)?.name ?? "";
  if (node.kind === "workflow") return tree.workflows.find((w) => w.id === node.id)?.name ?? "";
  return tree.files.find((f) => f.id === node.id)?.name ?? "";
}

/** The "…" menu on a tree row: create (folders only), rename, move, delete.
 *
 *  A read-only row gets a panel that explains instead of a panel that acts. The
 *  rules would refuse every one of these edits on it, and a menu full of items
 *  that always fail teaches nothing — the reason does. */
function RowMenu({ node, ctx }: { node: LibraryNode; ctx: TreeCtx }) {
  const { tree } = ctx;
  const readOnly = readOnlyReason(tree, node);
  // A menu opened on a row that is part of a multi-selection acts on the whole
  // selection: right-clicking one of four selected rows and getting an action
  // that touches only that one is a good way to delete the wrong three.
  const batch = ctx.isSelected(node.id) && ctx.selection.length > 1 ? ctx.selection : [node];
  const many = batch.length > 1;
  const name = many ? `${batch.length} items` : nodeLabel(tree, node);

  const panel = (id: string, go: (next: string) => void): MenuPanel => {
    if (readOnly && !many) return { heading: "Read-only", note: readOnly, items: [] };

    if (id === "move") {
      const targets = many ? sharedMoveTargets(tree, batch) : moveTargets(tree, node);
      return {
        heading: `Move ${name}`,
        note: many ? "Only somewhere every selected item can go." : undefined,
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
          onSelect: () => (many ? ctx.moveMany(batch, target) : ctx.move(node, target)),
        })),
      };
    }

    if (id === "delete") {
      const under = many ? ctx.countUnderAll(batch) : ctx.countUnder(node);
      const cascades = many || node.kind === "folder";
      return {
        heading: `Delete ${name}`,
        note: cascades
          ? `${under.folders} folder${under.folders === 1 ? "" : "s"}, ${under.workflows} workflow${under.workflows === 1 ? "" : "s"} and ${under.files} file${under.files === 1 ? "" : "s"} go with it.`
          : "This can't be undone from anywhere but the undo bar.",
        onBack: () => go("root"),
        items: [
          {
            id: "confirm",
            label: "Delete",
            icon: <Trash2 size={14} strokeWidth={1.8} />,
            danger: true,
            onSelect: () => (many ? ctx.removeMany(batch) : ctx.remove(node)),
          },
          {
            id: "cancel",
            label: "Cancel",
            shortcut: shortcutFor("dismiss"),
            icon: <X size={14} strokeWidth={1.8} />,
            onSelect: () => {},
          },
        ],
      };
    }

    const items: ActionItem[] = [];
    if (many) {
      // Rename and "new here" are single-row acts; a batch offers only the two
      // things that mean something over a set.
      items.push(
        { id: "move", label: `Move ${name} to…`, icon: <ArrowUpRight size={14} strokeWidth={1.8} />, keepOpen: true, onSelect: () => go("move") },
        {
          id: "delete",
          label: `Delete ${name}`,
          // Del on a row inside the selection opens exactly this confirm, so the
          // hint is as true of the batch as it is of a single row.
          shortcut: shortcutFor("delete"),
          icon: <Trash2 size={14} strokeWidth={1.8} />,
          danger: true,
          keepOpen: true,
          onSelect: () => go("delete"),
        },
      );
      return { heading: `${batch.length} selected`, items };
    }
    if (node.kind === "folder") {
      items.push(
        {
          id: "new-workflow",
          label: "New workflow",
          icon: <WorkflowIcon size={14} strokeWidth={1.8} />,
          onSelect: () => ctx.newWorkflowIn(node.id),
        },
        {
          id: "new-folder",
          label: "New folder",
          icon: <FolderPlus size={14} strokeWidth={1.8} />,
          onSelect: () => ctx.createFolder({ kind: "folder", id: node.id }),
        },
        {
          id: "new-config",
          label: "New config",
          detail: "untitled.xml",
          icon: <FileCode2 size={14} strokeWidth={1.8} />,
          onSelect: () => ctx.createFile(node.id, "xml"),
        },
        {
          id: "new-doc",
          label: "New document",
          detail: "untitled.md",
          icon: <FilePlus2 size={14} strokeWidth={1.8} />,
          onSelect: () => ctx.createFile(node.id, "md"),
        },
      );
    }
    items.push(
      {
        id: "rename",
        label: "Rename",
        shortcut: shortcutFor("rename"),
        icon: <Pencil size={14} strokeWidth={1.8} />,
        onSelect: () => ctx.startRename(node.id),
      },
      { id: "move", label: "Move to…", icon: <ArrowUpRight size={14} strokeWidth={1.8} />, keepOpen: true, onSelect: () => go("move") },
      {
        id: "delete",
        label: "Delete",
        shortcut: shortcutFor("delete"),
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
      tabbable={false}
      open={ctx.menuFor?.id === node.id}
      openTo={ctx.menuFor?.id === node.id ? ctx.menuFor.panel : "root"}
      onOpenChange={(next) => {
        if (!next) return ctx.closeMenu();
        // Acting on a row makes it the current row, so the cursor, the highlight
        // and the pointer all agree about which one is in play.
        ctx.setCursor(node.id);
        ctx.openMenu(node.id);
      }}
      trigger={<MoreHorizontal size={15} strokeWidth={2} />}
      panel={panel}
    />
  );
}

/** Opens a row in the detail pane without selecting it.
 *
 *  The point is the multi-selection: once several rows are selected, clicking one
 *  to read it would throw the selection away. This reads it and leaves the
 *  selection alone — the pane's breadcrumb says which row you're looking at, and
 *  the row takes the leading bar without the selection fill. */
function InfoButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Show ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="focusable flex size-6 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
    >
      <Info size={14} strokeWidth={1.8} />
    </button>
  );
}

/* ------------------------------------------------------------------- tree rows */

/** A selectable workflow leaf: type icon, name, then status and owner trailing.
 *  The status dot sits right because the left slot now says what a row *is*,
 *  consistently, and status is a second fact rather than the only one. */
function WorkflowLeaf({
  workflow,
  depth,
  sublabel,
  active,
  onSelect,
  ctx,
}: {
  workflow: Workflow;
  depth: number;
  sublabel?: string;
  active: boolean;
  onSelect: () => void;
  ctx: TreeCtx;
}) {
  const { memberById } = useStore();
  const owner = memberById(workflow.ownerId);
  const accent = WORKFLOW_STATUS_ACCENT[workflow.status];
  const node: LibraryNode = { kind: "workflow", id: workflow.id };
  return (
    <TreeRow
      id={workflow.id}
      ctx={ctx}
      node={node}
      depth={depth}
      icon={WORKFLOW_ROW_ICON.icon}
      iconTone={WORKFLOW_ROW_ICON.tone}
      label={workflow.name}
      sublabel={sublabel}
      active={active}
      expandable={false}
      open={false}
      onSelect={onSelect}
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
      info={<InfoButton label={workflow.name} onOpen={() => ctx.peek(node)} />}
      menu={ctx.editable ? <RowMenu node={node} ctx={ctx} /> : undefined}
    />
  );
}

/** A file leaf — a config or a document filed beside the workflows. */
function FileLeaf({
  file,
  depth,
  sublabel,
  active,
  onSelect,
  ctx,
}: {
  file: LibraryFile;
  depth: number;
  sublabel?: string;
  active: boolean;
  onSelect: () => void;
  ctx: TreeCtx;
}) {
  const { memberById } = useStore();
  const owner = memberById(file.ownerId);
  const look = FILE_ICON[kindOfFile(file.name)];
  const node: LibraryNode = { kind: "file", id: file.id };
  return (
    <TreeRow
      id={file.id}
      ctx={ctx}
      node={node}
      depth={depth}
      icon={look.icon}
      iconTone={look.tone}
      label={file.name}
      sublabel={sublabel}
      active={active}
      expandable={false}
      open={false}
      onSelect={onSelect}
      trailing={owner ? <Avatar member={owner} size={18} /> : undefined}
      info={<InfoButton label={file.name} onOpen={() => ctx.peek(node)} />}
      menu={ctx.editable ? <RowMenu node={node} ctx={ctx} /> : undefined}
    />
  );
}

/** One folder branch: the folder row, then (when open) its subfolders, the
 *  workflows and the files that live directly in it.
 *
 *  A folder row carries two separate actions, because it answers two questions:
 *  the chevron expands it (what's underneath?), and the row opens it (what does
 *  it hold?). Only the second is a selection — expanding a folder never changes
 *  what the detail pane is showing. */
function FolderBranch({
  folderId,
  depth,
  selectedId,
  onSelect,
  selectedFolderId,
  onSelectFolder,
  selectedFileId,
  onSelectFile,
  workflows,
  files,
  ctx,
}: {
  folderId: string;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  workflows: Workflow[];
  files: LibraryFile[];
  ctx: TreeCtx;
}) {
  const folder = ctx.tree.folders.find((f) => f.id === folderId);
  const shows = (kind: keyof TreeSlice, id: string) => !ctx.slice || ctx.slice[kind].has(id);
  const open = ctx.isExpanded(folderId);
  // Never-opened branches don't render at all. <Reveal> has to keep its children
  // mounted to animate closed, which would otherwise mean the whole library is in
  // the DOM whether or not anyone has looked at it.
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  if (!folder) return null;
  const kids = childFolders(ctx.tree.folders, folderId).filter((f) => shows("folders", f.id));
  const flows = workflows.filter((a) => a.folderId === folderId && shows("workflows", a.id));
  const docs = files.filter((f) => f.folderId === folderId && shows("files", f.id));
  const node: LibraryNode = { kind: "folder", id: folderId };

  return (
    <>
      <TreeRow
        id={folderId}
        ctx={ctx}
        node={node}
        depth={depth}
        icon={open ? <FolderOpen size={14} strokeWidth={1.8} /> : <FolderIcon size={14} strokeWidth={1.8} />}
        label={folder.name}
        active={folderId === selectedFolderId}
        expandable={kids.length > 0 || flows.length > 0 || docs.length > 0}
        open={open}
        onSelect={() => onSelectFolder(folderId)}
        droppable
        info={<InfoButton label={folder.name} onOpen={() => ctx.peek(node)} />}
        menu={ctx.editable ? <RowMenu node={node} ctx={ctx} /> : undefined}
      />
      <Reveal open={open} role="group">
        {everOpened && (
          <>
            {kids.map((k) => (
              <FolderBranch
                key={k.id}
                folderId={k.id}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                selectedFolderId={selectedFolderId}
                onSelectFolder={onSelectFolder}
                selectedFileId={selectedFileId}
                onSelectFile={onSelectFile}
                workflows={workflows}
                files={files}
                ctx={ctx}
              />
            ))}
            {flows.map((a) => (
              <WorkflowLeaf
                key={a.id}
                workflow={a}
                depth={depth + 1}
                active={a.id === selectedId}
                onSelect={() => onSelect(a.id)}
                ctx={ctx}
              />
            ))}
            {docs.map((f) => (
              <FileLeaf
                key={f.id}
                file={f}
                depth={depth + 1}
                active={f.id === selectedFileId}
                onSelect={() => onSelectFile(f.id)}
                ctx={ctx}
              />
            ))}
          </>
        )}
      </Reveal>
    </>
  );
}

/* --------------------------------------------------- merged library (nav + list) */

/** A dismissible line above the tree — a refusal, or the offer to undo. */
function TreeNotice({
  tone,
  children,
  action,
  onDismiss,
}: {
  tone: "critical" | "neutral";
  children: ReactNode;
  action?: { label: string; onSelect: () => void };
  onDismiss: () => void;
}) {
  const colours =
    tone === "critical"
      ? { background: "var(--tomato-a3)", color: "var(--tomato-a11)" }
      : { background: "var(--color-component)", color: "var(--color-secondary-foreground)" };
  return (
    <div role={tone === "critical" ? "alert" : "status"} className="m-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.72rem] leading-snug" style={colours}>
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onSelect}
          className="focusable shrink-0 rounded px-1 font-medium underline underline-offset-2"
        >
          {action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="focusable shrink-0 rounded">
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * The workflow library: one left panel merging the Public/Private folder tree
 * with the workflows and files inside each folder, so navigation and selection
 * live in one column instead of two.
 *
 * It is a real ARIA tree — one tab stop, arrows to move, `aria-expanded` and
 * `aria-level` on every row — because 35 rows of three buttons each is 75 tab
 * stops to get *past* a navigation pane, and a screen reader reading "button,
 * button, button" is not navigation at all.
 *
 * A search no longer flattens it. Matches keep their ancestors and the branches
 * open themselves, because we added the folder path to every breadcrumb on the
 * grounds that where a thing lives is half of what you need to know — and then a
 * search was throwing exactly that away.
 */
function WorkflowLibrary({
  workflows,
  files,
  narrowed,
  slice,
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
  slice?: TreeSlice;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
}) {
  const store = useStore();
  const tree: LibraryTree = { folders: store.folders, workflows: store.workflows, files: store.files };
  // What the rows are drawn from: narrowed and ordered exactly as rendered, so
  // the keyboard's "next row" is the row the eye sees next.
  const rendered: LibraryTree = { folders: store.folders, workflows, files };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [undoDismissed, setUndoDismissed] = useState(true);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [treeFocused, setTreeFocused] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Where a shift-range measures from. Set by every plain or toggling click, so
  // shift always extends from the last row you touched rather than from whatever
  // the detail pane happens to be showing.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<{ id: string; panel: string } | null>(null);
  const [dragging, setDragging] = useState<LibraryNode | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const treeBox = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);
  const typed = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  // A search opens what it needs to show; outside one, the stored state rules.
  const isExpanded = (id: string) => (narrowed ? true : store.isExpanded(id));
  const layout = store.libraryLayout;
  const rows = visibleRows(rendered, { expanded: isExpanded, slice, layout });
  // Where a leaf lives, for the flat list's second line. Read from the same
  // `folderPath` the breadcrumb uses, so the two never describe one folder
  // differently.
  const pathOf = (folderId: string) => folderPath(store.folders, folderId);

  const nameOfRow = (row: TreeRowInfo): string => {
    if (row.kind === "root") return row.id === "vis:public" ? "Public" : "Private";
    if (row.kind === "folder") return store.folders.find((f) => f.id === row.id)?.name ?? "";
    if (row.kind === "workflow") return workflows.find((w) => w.id === row.id)?.name ?? "";
    return files.find((f) => f.id === row.id)?.name ?? "";
  };

  // Keep the cursor on a row that still exists — a delete or a collapse can take
  // the one it was on.
  useEffect(() => {
    if (rows.length === 0) return;
    if (!cursorId || !rows.some((r) => r.id === cursorId)) setCursorId(rows[0].id);
  }, [rows, cursorId]);

  // And never stay in a rename whose row isn't on screen. The field lives in the
  // row, so a rename aimed at a node the current layout doesn't draw would be
  // invisible *and* jam the tree: `onKeyDown` returns early while renaming, so
  // every arrow key would silently stop working with nothing to show why.
  useEffect(() => {
    if (renamingId && !rows.some((r) => r.id === renamingId)) setRenamingId(null);
  }, [rows, renamingId]);

  useEffect(() => {
    if (!wantFocus.current || !cursorId) return;
    wantFocus.current = false;
    treeBox.current?.querySelector<HTMLElement>(`[data-tree-row="${CSS.escape(cursorId)}"]`)?.focus();
  }, [cursorId, rows]);

  const focusRow = (id: string | null) => {
    if (!id) return;
    wantFocus.current = true;
    setCursorId(id);
  };

  // A rename ends by unmounting its input, and the focus of an unmounted element
  // falls to <body> — which drops the keyboard out of the tree, so the arrow keys
  // and Del that worked a moment ago now go nowhere. Put it back on the row,
  // whichever way the edit ended. Now that the menu advertises F2, a shortcut that
  // strands you is a shortcut the menu shouldn't be offering.
  //
  // Only when nothing else claimed focus: a rename also ends by clicking away, and
  // yanking focus back out of whatever you clicked would be worse than the fall.
  const wasRenaming = useRef<string | null>(null);
  useEffect(() => {
    if (renamingId) return void (wasRenaming.current = renamingId);
    const id = wasRenaming.current;
    wasRenaming.current = null;
    if (!id) return;
    // Next frame, not this one. Clicking away unmounts the input during `focusout`,
    // which is *before* the browser has focused what was clicked — so right now
    // `activeElement` reads as <body> whether the rename ended by Escape or by a
    // click elsewhere, and the two are indistinguishable. A frame later it isn't.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      treeBox.current?.querySelector<HTMLElement>(`[data-tree-row="${CSS.escape(id)}"]`)?.focus();
      setCursorId(id);
    });
    return () => cancelAnimationFrame(frame);
  }, [renamingId]);

  const nodeOf = (row: TreeRowInfo): LibraryNode | null =>
    row.kind === "root" ? null : { kind: row.kind, id: row.id };

  const openRow = (row: TreeRowInfo) => {
    if (row.kind === "root") return store.toggleExpanded(row.id);
    // Opening from the keyboard means the same thing as a plain click, selection
    // included — otherwise Enter would show you a row the bulk actions don't
    // think you picked.
    store.setTreeSelection([{ kind: row.kind, id: row.id }]);
    setAnchorId(row.id);
    if (row.kind === "folder") clickFolder(row.id);
    if (row.kind === "workflow") onSelect(row.id);
    if (row.kind === "file") onSelectFile(row.id);
  };

  /** Extend the selection from the anchor to a row, for Shift+Arrow. */
  const extendTo = (id: string) => {
    const from = rows.findIndex((r) => r.id === (anchorId ?? cursorId));
    const to = rows.findIndex((r) => r.id === id);
    if (from === -1 || to === -1) return;
    if (!anchorId) setAnchorId(rows[from].id);
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    store.setTreeSelection(
      rows
        .slice(lo, hi + 1)
        .filter((r) => r.kind !== "root")
        .map((r) => ({ kind: r.kind, id: r.id }) as LibraryNode),
    );
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (renamingId) return;
    const row = rows.find((r) => r.id === cursorId);
    if (!row) return;
    const index = rows.indexOf(row);
    const node = nodeOf(row);

    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        const next = rowAfter(rows, row.id, e.key === "ArrowDown" ? 1 : -1);
        if (e.shiftKey && next) extendTo(next);
        return focusRow(next);
      }
      case "ArrowRight":
        e.preventDefault();
        if (row.expandable && !row.expanded) return store.expand(row.id);
        // Already open: step into it, but only if the next row really is a child.
        if (rows[index + 1]?.parentId === row.id) return focusRow(rows[index + 1].id);
        return;
      case "ArrowLeft":
        e.preventDefault();
        if (row.expandable && row.expanded) return store.toggleExpanded(row.id);
        return focusRow(row.parentId);
      case "Escape":
        // Back to one row — a multi-selection you can't put down is one you have
        // to click your way out of.
        if (store.treeSelection.length > 1) {
          e.preventDefault();
          store.setTreeSelection(node ? [node] : []);
        }
        return;
      case "Home":
        e.preventDefault();
        return focusRow(rows[0]?.id ?? null);
      case "End":
        e.preventDefault();
        return focusRow(rows[rows.length - 1]?.id ?? null);
      case "Enter":
      case " ":
        e.preventDefault();
        return openRow(row);
      case "F2":
        e.preventDefault();
        if (node && ctx.editable && !readOnlyReason(tree, node)) setRenamingId(row.id);
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        if (node && ctx.editable) setMenuFor({ id: row.id, panel: "delete" });
        return;
      case "F10":
        if (!e.shiftKey) return;
        e.preventDefault();
        if (node && ctx.editable) setMenuFor({ id: row.id, panel: "root" });
        return;
      case "ContextMenu":
        e.preventDefault();
        if (node && ctx.editable) setMenuFor({ id: row.id, panel: "root" });
        return;
      default:
        break;
    }

    // Typeahead. A buffer rather than a single key, so "sy" reaches Synthetics
    // without arrowing past everything that starts with an s.
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 600 ? e.key : typed.current.text + e.key, at: now };
    const hit = rowMatching(rows, row.id, typed.current.text, nameOfRow);
    if (hit) focusRow(hit);
  };

  // Clicking a folder row opens it *and* toggles it: the second click closes what
  // the first revealed, which is what a folder does in every other tree. Selecting
  // still happens either way, so the detail pane follows the click regardless of
  // which direction the branch went.
  //
  // On a phone it only toggles. There the tree *is* the screen and a selection
  // replaces it, so opening a folder would swap the tree for that folder's detail
  // — and browsing two levels down would be impossible, because every tap out of
  // the tree is a tap out of the tree. A folder is a container you look inside;
  // a workflow or a file is the thing you go to. Its detail is still one tap up
  // the breadcrumb from anything filed in it.
  const clickFolder = (id: string) => {
    store.toggleExpanded(id);
    if (!store.isMobile) onSelectFolder(id);
  };

  /** Report a batch honestly: what went through, and the first reason the rest
   *  didn't. Silently dropping the refusals would make a partial move look total. */
  const afterBatch = (moved: number, refusals: { name: string; reason: string }[]) => {
    if (moved > 0) setUndoDismissed(false);
    setRefusal(
      refusals.length === 0
        ? null
        : `${moved} moved. ${refusals.length} couldn't be: ${refusals[0].reason}${refusals.length > 1 ? ` (and ${refusals.length - 1} more)` : ""}`,
    );
  };

  const afterEdit = (reason: string | null) => {
    setRefusal(reason);
    if (reason === null) setUndoDismissed(false);
    return reason;
  };

  // Every legal destination for whatever is being dragged, as row ids — the same
  // list the move menu is built from, so a drop the rules would refuse never
  // lights up in the first place.
  const dropIds = useMemo(() => {
    if (!dragging) return new Set<string>();
    return new Set(
      moveTargets(tree, dragging).map((t) => (t.kind === "root" ? `vis:${t.visibility}` : t.id)),
    );
  }, [dragging, tree]);

  const ctx: TreeCtx = {
    tree,
    slice,
    editable: store.allowed("author"),
    isMobile: store.isMobile,
    isExpanded,
    toggle: (id) => store.toggleExpanded(id),
    renamingId,
    startRename: (id) => {
      setRefusal(null);
      setRenamingId(id);
    },
    cancelRename: () => setRenamingId(null),
    commitRename: (node, name) => {
      const reason = afterEdit(store.renameNode(node, name));
      // Stay in the field when the name was refused — otherwise the correction
      // costs another trip through the menu.
      if (reason === null) setRenamingId(null);
    },
    move: (node, target) => {
      const reason = afterEdit(store.moveNode(node, target));
      if (reason === null && target.kind === "folder") store.expand(target.id);
    },
    remove: (node) => afterEdit(store.deleteNode(node)),
    moveMany: (nodes, target) => {
      const { moved, refusals } = store.moveNodes(nodes, target);
      afterBatch(moved, refusals);
      if (moved > 0 && target.kind === "folder") store.expand(target.id);
    },
    removeMany: (nodes) => {
      const { moved, refusals } = store.deleteNodes(nodes);
      afterBatch(moved, refusals);
    },
    countUnderAll: store.countUnderAll,
    createFolder: (target) => {
      setRefusal(null);
      const made = store.newFolder(target);
      if ("reason" in made) return setRefusal(made.reason);
      if (target.kind === "folder") store.expand(target.id);
      setUndoDismissed(false);
      onSelectFolder(made.id);
      setRenamingId(made.id);
    },
    createFile: (folderId, extension) => {
      setRefusal(null);
      const made = store.newFile(folderId, extension);
      if ("reason" in made) return setRefusal(made.reason);
      store.expand(folderId);
      setUndoDismissed(false);
      onSelectFile(made.id);
      setRenamingId(made.id);
    },
    newWorkflowIn: (folderId) => store.newWorkflow(folderId),
    countUnder: store.countUnder,
    hoveredId,
    hoverRow: setHoveredId,
    unhoverRow: (id) => setHoveredId((current) => (current === id ? null : current)),
    selection: store.treeSelection,
    isSelected: (id) => store.treeSelection.some((n) => n.id === id),
    clickRow: (id, modifiers) => {
      const row = rows.find((r) => r.id === id);
      if (!row || row.kind === "root") return;
      const node: LibraryNode = { kind: row.kind, id: row.id };

      if (modifiers.shift && anchorId) {
        // Everything between the anchor and here, in the order the rows are
        // drawn — which is why `visibleRows` is the one source of that order.
        const from = rows.findIndex((r) => r.id === anchorId);
        const to = rows.indexOf(row);
        if (from !== -1) {
          const [lo, hi] = from <= to ? [from, to] : [to, from];
          store.setTreeSelection(
            rows
              .slice(lo, hi + 1)
              .filter((r) => r.kind !== "root")
              .map((r) => ({ kind: r.kind, id: r.id }) as LibraryNode),
          );
          return;
        }
      }
      if (modifiers.meta) {
        setAnchorId(id);
        const already = store.treeSelection.some((n) => n.id === id);
        store.setTreeSelection(
          already ? store.treeSelection.filter((n) => n.id !== id) : [...store.treeSelection, node],
        );
        return;
      }
      setAnchorId(id);
      store.setTreeSelection([node]);
    },
    peek: store.peekNode,
    cursorId,
    treeFocused,
    setCursor: setCursorId,
    menuFor,
    openMenu: (id, panel = "root") => setMenuFor({ id, panel }),
    closeMenu: () => setMenuFor(null),
    dragging,
    dropIds,
    dropOn,
    onDragStart: setDragging,
    onDragEnd: () => {
      setDragging(null);
      setDropOn(null);
    },
    onDragOver: setDropOn,
    onDrop: (rowId) => {
      if (!dragging) return;
      const target: MoveTarget = rowId.startsWith("vis:")
        ? { kind: "root", visibility: rowId === "vis:public" ? "public" : "private" }
        : { kind: "folder", id: rowId };
      afterEdit(store.moveNode(dragging, target));
      if (!rowId.startsWith("vis:")) store.expand(rowId);
      setDragging(null);
      setDropOn(null);
    },
  };

  const roots: { visibility: Visibility; label: string; icon: ReactNode }[] = [
    { visibility: "public", label: "Public", icon: <Globe size={14} strokeWidth={1.8} /> },
    { visibility: "private", label: "Private", icon: <Lock size={14} strokeWidth={1.8} /> },
  ];

  const nothingShowing = rows.every((r) => r.kind === "root");

  return (
    <Pane width={PANE_WIDTH.list}>
      {refusal && (
        <TreeNotice tone="critical" onDismiss={() => setRefusal(null)}>
          {refusal}
        </TreeNotice>
      )}
      {!refusal && !undoDismissed && store.undoable && (
        <TreeNotice
          tone="neutral"
          action={{ label: "Undo", onSelect: () => { store.undo(); setUndoDismissed(true); } }}
          onDismiss={() => setUndoDismissed(true)}
        >
          {store.undoable.label}
        </TreeNotice>
      )}
      <div
        ref={treeBox}
        role="tree"
        aria-label="Library tree"
        aria-multiselectable={false}
        onKeyDown={onKeyDown}
        // focusin/focusout bubble, so these fire for whichever row holds focus.
        // Moving between rows fires blur then focus in one tick and React batches
        // them, so the flag doesn't flicker on the way past.
        onFocus={() => setTreeFocused(true)}
        onBlur={() => setTreeFocused(false)}
        // The density lives here rather than on each row: the rows read it by
        // inheritance, so one place decides and nothing has to be threaded down.
        style={densityVars(store.libraryDensity) as CSSProperties}
        className="scrollbar-none flex-1 overflow-y-auto px-2 py-2"
      >
        {narrowed && nothingShowing ? (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            Nothing matches the current search or filters.
          </p>
        ) : (
          roots.map((root) => {
            const visKey = `vis:${root.visibility}`;
            const open = isExpanded(visKey);
            const topFolders = childFolders(store.folders, null, root.visibility).filter(
              (f) => !slice || slice.folders.has(f.id),
            );
            // The flat layout's contents. Taken from `rows` rather than filtered
            // again here, so the order the eye sees is by construction the order
            // the arrow keys walk — the same reason `visibleRows` exists at all.
            const flat = rows.filter((r) => r.parentId === visKey && r.kind !== "folder");
            return (
              <div key={root.visibility} className="mb-1">
                {/* Public/Private are section headers, not folders — nothing lives
                    in them directly, so they expand rather than open. They still
                    take a drop: a folder can move to the top of either tree. */}
                <TreeRow
                  id={visKey}
                  ctx={ctx}
                  depth={0}
                  icon={root.icon}
                  label={root.label}
                  active={false}
                  expandable={layout === "list" ? flat.length > 0 : topFolders.length > 0}
                  open={open}
                  onSelect={() => store.toggleExpanded(visKey)}
                  droppable
                  menu={
                    // "New folder" is the estate's only action, and the flat
                    // layout has no folder rows for the new one to appear in —
                    // the rename it opens with would have nowhere to land.
                    ctx.editable && layout === "tree" ? (
                      <ActionMenu
                        label={`Actions for ${root.label}`}
                        align="right"
                        tabbable={false}
                        open={menuFor?.id === visKey}
                        onOpenChange={(next) => (next ? setMenuFor({ id: visKey, panel: "root" }) : setMenuFor(null))}
                        trigger={<MoreHorizontal size={15} strokeWidth={2} />}
                        panel={() => ({
                          items: [
                            {
                              id: "new-folder",
                              label: "New folder",
                              icon: <FolderPlus size={14} strokeWidth={1.8} />,
                              onSelect: () => ctx.createFolder({ kind: "root", visibility: root.visibility }),
                            },
                          ],
                        })}
                      />
                    ) : undefined
                  }
                />
                <Reveal open={open} role="group">
                  {layout === "list"
                    ? flat.map((row) => {
                        const workflow = row.kind === "workflow" ? workflows.find((w) => w.id === row.id) : undefined;
                        const file = row.kind === "file" ? files.find((f) => f.id === row.id) : undefined;
                        if (workflow)
                          return (
                            <WorkflowLeaf
                              key={workflow.id}
                              workflow={workflow}
                              depth={1}
                              sublabel={pathOf(workflow.folderId)}
                              active={workflow.id === selectedId}
                              onSelect={() => onSelect(workflow.id)}
                              ctx={ctx}
                            />
                          );
                        if (file)
                          return (
                            <FileLeaf
                              key={file.id}
                              file={file}
                              depth={1}
                              sublabel={pathOf(file.folderId)}
                              active={file.id === selectedFileId}
                              onSelect={() => onSelectFile(file.id)}
                              ctx={ctx}
                            />
                          );
                        return null;
                      })
                    : topFolders.map((f) => (
                    <FolderBranch
                      key={f.id}
                      folderId={f.id}
                      depth={1}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      selectedFolderId={selectedFolderId}
                      onSelectFolder={clickFolder}
                      selectedFileId={selectedFileId}
                      onSelectFile={onSelectFile}
                      workflows={workflows}
                      files={files}
                      ctx={ctx}
                    />
                      ))}
                </Reveal>
              </div>
            );
          })
        )}
      </div>
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
  const { memberById, runsForWorkflow, workflowById, editWorkflow, runWorkflow, reviewWorkflow, role, allowed, selectFolder, expand, folders } =
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
              {/* Really runs it: queued for the pool when there is a backend, executed
                  in this tab when there isn't. A mirrored flow is executed by its own
                  platform, so the button says so rather than failing on the press. */}
              {workflow.platform === "conduit" ? (
                <Button variant="solid" className="w-fit" onClick={() => runWorkflow(workflow.id)}>
                  <Play size={14} strokeWidth={2} />
                  Run now
                </Button>
              ) : (
                <span className="text-body-sm text-tertiary-foreground">
                  Runs on {PLATFORM_LABEL[workflow.platform]} — Conduit observes it here.
                </span>
              )}
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
                onClick={() => {
                  expand(workflow.folderId);
                  selectFolder(workflow.folderId);
                }}
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

/* --------------------------------------------------------- selection summary */

/**
 * What the detail pane shows while several rows are selected.
 *
 * It isn't a preview of any one of them — it's the answer to "what would a bulk
 * action touch", which is the only question a multi-selection raises. The tally
 * counts the whole cascade, so a selected folder is reported by what it holds
 * rather than as one row, and anything read-only is named up front rather than
 * discovered when the move half-fails.
 */
function SelectionDetail({
  selection,
  onOpen,
}: {
  selection: LibraryNode[];
  onOpen: (node: LibraryNode) => void;
}) {
  const { folders, workflows, files, countUnderAll } = useStore();
  const tree: LibraryTree = { folders, workflows, files };
  const under = countUnderAll(selection);
  const blocked = selection
    .map((node) => ({ node, reason: readOnlyReason(tree, node) }))
    .filter((r) => r.reason !== null);

  const nameOf = (node: LibraryNode) => nodeLabel(tree, node) || node.id;
  const iconOf = (node: LibraryNode) =>
    node.kind === "folder" ? (
      <FolderIcon size={14} strokeWidth={1.8} />
    ) : node.kind === "workflow" ? (
      <span style={{ color: WORKFLOW_ROW_ICON.tone }}>{WORKFLOW_ROW_ICON.icon}</span>
    ) : (
      <span style={{ color: FILE_ICON[kindOfFile(nameOf(node))].tone }}>
        {FILE_ICON[kindOfFile(nameOf(node))].icon}
      </span>
    );

  return (
    <>
      <DetailPane>
        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-8">
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Selected" value={num(selection.length)} sub="rows in the tree" />
              <StatTile
                label="Workflows"
                value={num(under.workflows)}
                sub={under.folders > 1 ? `across ${under.folders} folders` : "in the selection"}
              />
              <StatTile label="Files" value={num(under.files)} sub="configs and documents" />
            </div>

            {blocked.length > 0 && (
              <p className="rounded-xl px-3 py-2 text-body-sm" style={{ background: "var(--amber-a3)", color: "var(--amber-a11)" }}>
                {blocked.length} of these {blocked.length === 1 ? "is" : "are"} mirrored from another
                platform and can't be moved or deleted here. The rest still can — a batch reports what
                went through and what didn't.
              </p>
            )}

            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-body-base font-medium text-primary-foreground">In the selection</h3>
                <span className="text-body-sm text-tertiary-foreground">
                  A folder here brings everything beneath it. Open any row to leave the selection intact.
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {selection.map((node) => {
                  const reason = readOnlyReason(tree, node);
                  return (
                    <ContentRow
                      key={node.id}
                      icon={iconOf(node)}
                      title={nameOf(node)}
                      sub={
                        node.kind === "folder"
                          ? folderPath(folders, node.id)
                          : reason
                            ? "Mirrored — read-only here"
                            : node.kind === "workflow"
                              ? "Workflow"
                              : FILE_ICON[kindOfFile(nameOf(node))].label
                      }
                      onOpen={() => onOpen(node)}
                    />
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </DetailPane>

      <ContextPane>
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-component text-secondary-foreground">
              <Layers size={22} strokeWidth={1.7} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">
                {selection.length} selected
              </h2>
              <p className="text-body-base text-secondary-foreground">
                Use a row's menu to move or delete the whole selection. Shift-click for a range,
                {" "}
                {"\u2318"}/Ctrl-click to add one, Escape to drop back to one.
              </p>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Rows">{num(selection.length)}</MetaRow>
            <MetaRow label="Folders">{num(under.folders)}</MetaRow>
            <MetaRow label="Workflows">{num(under.workflows)}</MetaRow>
            <MetaRow label="Files">{num(under.files)}</MetaRow>
            <MetaRow label="Read-only">
              {blocked.length === 0 ? <span className="text-tertiary-foreground">None</span> : num(blocked.length)}
            </MetaRow>
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
    expand,
    treeSelection,
    peeking,
    peekNode,
    controls,
  } = useStore();
  const state = controls("workflows");
  const narrowed = isNarrowed(state);
  const visible = visibleWorkflows(workflows, state);
  const visibleFiles = narrowedFiles(files, state);
  // While a search is on, the tree keeps its shape: the matches, plus every
  // folder on the path down to one, plus a folder matched by its own name.
  const slice = narrowed
    ? narrowTree(
        { folders, workflows, files },
        {
          folders: new Set(
            folders.filter((f) => matchesQuery(state.query, [f.name, f.id])).map((f) => f.id),
          ),
          workflows: new Set(visible.map((w) => w.id)),
          files: new Set(visibleFiles.map((f) => f.id)),
        },
      )
    : undefined;
  const selected = selectedWorkflowId
    ? workflows.find((a) => a.id === selectedWorkflowId) ?? null
    : null;
  const selectedFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) ?? null : null;
  const selectedFile = selectedFileId ? files.find((f) => f.id === selectedFileId) ?? null : null;
  // Going to a folder from a detail pane reveals it in the tree. Unlike a click on
  // the row itself it never collapses one — you asked to go there, not to toggle it.
  const openFolder = (id: string) => {
    expand(id);
    selectFolder(id);
  };

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

  // What the detail pane is showing, if anything — which on a phone is also
  // whether the library tree or the opened thing is the screen. A multi-selection
  // counts: its summary is what the pane answers with, so it is a destination.
  const showingDetail =
    (treeSelection.length > 1 && !peeking) || !!selected || !!selectedFolder || !!selectedFile;

  return (
    <SplitView mobile={showingDetail ? "detail" : "list"}>
      <WorkflowLibrary
        workflows={visible}
        files={visibleFiles}
        narrowed={narrowed}
        slice={slice}
        selectedId={selectedWorkflowId}
        onSelect={selectWorkflow}
        selectedFolderId={selectedFolderId}
        onSelectFolder={openFolder}
        selectedFileId={selectedFileId}
        onSelectFile={selectFile}
      />
      {treeSelection.length > 1 && !peeking ? (
        // Several rows selected: the pane answers "what would a bulk action
        // touch" rather than previewing one of them. Opening a row from the list
        // leaves the selection intact — that is what the info button is for too.
        <SelectionDetail
          selection={treeSelection}
          // Opening from the summary is a peek too — the list says the selection
          // stays intact, so it had better.
          onOpen={(node) => {
            if (node.kind === "folder") expand(node.id);
            peekNode(node);
          }}
        />
      ) : selected ? (
        <WorkflowDetail workflow={selected} onSelectWorkflow={selectWorkflow} />
      ) : selectedFolder ? (
        <FolderDetail
          folder={selectedFolder}
          workflows={visible}
          files={visibleFiles}
          narrowed={narrowed}
          onSelectFolder={openFolder}
          onSelectWorkflow={selectWorkflow}
          onSelectFile={selectFile}
        />
      ) : selectedFile ? (
        <FileDetail file={selectedFile} onSelectFolder={openFolder} />
      ) : (
        <EmptyDetail>Select a workflow, a folder, or a file.</EmptyDetail>
      )}
    </SplitView>
  );
}
