import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Folder as FolderIcon,
  Globe,
  Link2,
  Lock,
  Package,
  Pencil,
  Play,
  Workflow as WorkflowIcon,
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
import type { Folder, Workflow, WorkflowStatus, Visibility } from "../data/types";
import { folders as allFolders } from "../data/workflows";
import { Avatar } from "./Avatar";
import { Chip } from "./Chip";
import { WORKFLOW_STATUS_ACCENT, WorkflowStatusChip } from "./Badges";
import { RunRow } from "./RunRow";
import { minutesAgo, num } from "../lib/format";
import { childFolders, folderPath, workflowsUnder } from "../lib/folders";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { isNarrowed, matchesQuery, ordered, passesFilter, resolveSort, type WorkspaceState } from "../lib/workspace";
import { workspaceControls } from "../data/workspaceControls";
import { TabStrip } from "./TabStrip";
import { StatTile } from "./StatTile";
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

/* ----------------------------------------------------------------- folder tree */

function TreeRow({
  depth,
  icon,
  label,
  active,
  hasChildren,
  open,
  onToggle,
  onSelect,
  trailing,
}: {
  depth: number;
  icon: ReactNode;
  label: string;
  active: boolean;
  hasChildren: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={
        "focusable group flex h-8 w-full items-center gap-1 rounded-lg pr-2 text-left transition-colors " +
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
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
      >
        <span className="flex shrink-0 items-center justify-center text-tertiary-foreground" style={{ width: 16, height: 16 }}>{icon}</span>
        <span className="truncate text-body-sm text-primary-foreground">{label}</span>
      </button>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  );
}

/** A selectable workflow leaf inside the library tree (status dot + name, with
 *  the owner avatar trailing). */
function WorkflowLeaf({
  workflow,
  depth,
  active,
  onSelect,
}: {
  workflow: Workflow;
  depth: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { memberById } = useStore();
  const owner = memberById(workflow.ownerId);
  const accent = WORKFLOW_STATUS_ACCENT[workflow.status];
  return (
    <TreeRow
      depth={depth}
      icon={<span className="size-2 rounded-full" style={{ background: `var(--${accent}-9)` }} />}
      label={workflow.name}
      active={active}
      hasChildren={false}
      open={false}
      onToggle={() => {}}
      onSelect={onSelect}
      trailing={owner ? <Avatar member={owner} size={18} /> : undefined}
    />
  );
}

/** One folder branch: the folder row, then (when open) its subfolders and the
 *  workflows that live directly in it, rendered as leaf rows.
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
  workflows,
}: {
  folderId: string;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  workflows: Workflow[];
}) {
  const folder = allFolders.find((f) => f.id === folderId)!;
  const kids = childFolders(allFolders, folderId);
  const autos = workflows.filter((a) => a.folderId === folderId);
  const open = expanded.has(folderId);
  return (
    <>
      <TreeRow
        depth={depth}
        icon={<FolderIcon size={14} strokeWidth={1.8} />}
        label={folder.name}
        active={folderId === selectedFolderId}
        hasChildren={kids.length > 0 || autos.length > 0}
        open={open}
        onToggle={() => toggle(folderId)}
        onSelect={() => onSelectFolder(folderId)}
      />
      {open && (
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
              workflows={workflows}
            />
          ))}
          {autos.map((a) => (
            <WorkflowLeaf
              key={a.id}
              workflow={a}
              depth={depth + 1}
              active={a.id === selectedId}
              onSelect={() => onSelect(a.id)}
            />
          ))}
        </>
      )}
    </>
  );
}

/* --------------------------------------------------- merged library (nav + list) */

/** The workflow library: a single left panel that merges the Public/Private
 *  folder tree with the workflows inside each folder (as selectable leaves), so
 *  navigation and selection live in one column instead of two. While the
 *  workspace header narrows the page (a search or a filter), the tree flattens to
 *  the matches — the folders are structure, not a second filter. */
function WorkflowLibrary({
  workflows,
  narrowed,
  selectedId,
  onSelect,
  selectedFolderId,
  onSelectFolder,
}: {
  workflows: Workflow[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
}) {
  // Default to fully expanded so the merged workflows are visible up front.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set<string>(["vis:public", "vis:private", ...allFolders.map((f) => f.id)]),
  );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  // Opening a folder also reveals it: a collapsed folder whose detail is on screen
  // would leave the tree contradicting the pane. It never collapses one — the
  // chevron is the only control that closes a branch.
  const selectFolder = (id: string) => {
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    onSelectFolder(id);
  };

  const roots: { visibility: Visibility; label: string; icon: ReactNode }[] = [
    { visibility: "public", label: "Public", icon: <Globe size={14} strokeWidth={1.8} /> },
    { visibility: "private", label: "Private", icon: <Lock size={14} strokeWidth={1.8} /> },
  ];

  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {narrowed ? (
          workflows.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
              No workflows match the current search or filters.
            </p>
          ) : (
            workflows.map((a) => (
              <WorkflowLeaf
                key={a.id}
                workflow={a}
                depth={0}
                active={a.id === selectedId}
                onSelect={() => onSelect(a.id)}
              />
            ))
          )
        ) : (
          roots.map((root) => {
            const visKey = `vis:${root.visibility}`;
            const open = expanded.has(visKey);
            const topFolders = childFolders(allFolders, null, root.visibility);
            return (
              <div key={root.visibility} className="mb-1">
                {/* Public/Private are section headers, not folders — nothing lives
                    in them directly, so they expand rather than open. */}
                <TreeRow
                  depth={0}
                  icon={root.icon}
                  label={root.label}
                  active={false}
                  hasChildren={topFolders.length > 0}
                  open={open}
                  onToggle={() => toggle(visKey)}
                  onSelect={() => toggle(visKey)}
                />
                {open &&
                  topFolders.map((f) => (
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
                      workflows={workflows}
                    />
                  ))}
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
  const { memberById, runsForWorkflow, workflowById, editWorkflow, reviewWorkflow, role, allowed, selectFolder } =
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
                <span className="truncate">{folderPath(allFolders, workflow.folderId)}</span>
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
  narrowed,
  onSelectFolder,
  onSelectWorkflow,
}: {
  folder: Folder;
  workflows: Workflow[];
  narrowed: boolean;
  onSelectFolder: (id: string) => void;
  onSelectWorkflow: (id: string) => void;
}) {
  const { memberById } = useStore();
  const subtree = workflowsUnder(workflows, allFolders, folder.id);
  const here = workflows.filter((w) => w.folderId === folder.id);
  const subfolders = childFolders(allFolders, folder.id);
  const runCount = subtree.reduce((n, w) => n + w.runCount, 0);
  // Weighted by runs: an workflow that ran twice shouldn't move the folder's rate
  // as far as one that ran a thousand times.
  const successRate =
    runCount === 0 ? null : subtree.reduce((n, w) => n + w.runCount * w.successRate, 0) / runCount;
  const published = subtree.filter((w) => w.status === "Published").length;
  const platforms = [...new Set(subtree.map((w) => w.platform))];
  const parentPath = folder.parentId ? folderPath(allFolders, folder.parentId) : null;

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
                    const count = workflowsUnder(workflows, allFolders, sub.id).length;
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
                        icon={
                          <span
                            className="size-2 rounded-full"
                            style={{ background: `var(--${WORKFLOW_STATUS_ACCENT[w.status]}-9)` }}
                          />
                        }
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
                {folderPath(allFolders, folder.id)}
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
  const { workflows, viewMode, selectedWorkflowId, selectWorkflow, selectedFolderId, selectFolder, controls } =
    useStore();
  const state = controls("workflows");
  const narrowed = isNarrowed(state);
  const visible = visibleWorkflows(workflows, state);
  const selected = selectedWorkflowId
    ? workflows.find((a) => a.id === selectedWorkflowId) ?? null
    : null;
  const selectedFolder = selectedFolderId ? allFolders.find((f) => f.id === selectedFolderId) ?? null : null;

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
        narrowed={narrowed}
        selectedId={selectedWorkflowId}
        onSelect={selectWorkflow}
        selectedFolderId={selectedFolderId}
        onSelectFolder={selectFolder}
      />
      {selected ? (
        <WorkflowDetail workflow={selected} onSelectWorkflow={selectWorkflow} />
      ) : selectedFolder ? (
        <FolderDetail
          folder={selectedFolder}
          workflows={visible}
          narrowed={narrowed}
          onSelectFolder={selectFolder}
          onSelectWorkflow={selectWorkflow}
        />
      ) : (
        <EmptyDetail>Select a workflow or a folder.</EmptyDetail>
      )}
    </SplitView>
  );
}
