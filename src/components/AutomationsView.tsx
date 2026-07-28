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
  Workflow,
} from "lucide-react";
import { useStore } from "../store";
import type { Automation, AutomationStatus, Visibility } from "../data/types";
import { folders as allFolders } from "../data/automations";
import { Avatar } from "./Avatar";
import { AUTOMATION_STATUS_ACCENT, AutomationStatusChip } from "./Badges";
import { RunRow } from "./RunRow";
import { num } from "../lib/format";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { SegmentedControl } from "./SegmentedControl";
import { isNarrowed, matchesQuery, passesFilter, type WorkspaceState } from "../lib/workspace";

/* ------------------------------------------------------------------ shared bits */

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** Automations narrowed and ordered by the workspace header — the same set the
 *  library tree, the search results, and the board all draw from. */
function visibleAutomations(automations: Automation[], state: WorkspaceState): Automation[] {
  const rows = automations.filter(
    (a) =>
      matchesQuery(state.query, [a.name, a.id, a.description, a.packages.join(" ")]) &&
      passesFilter(state, "status", a.status) &&
      passesFilter(state, "visibility", a.visibility),
  );

  const sorted = [...rows];
  switch (state.sort) {
    case "runs":
      sorted.sort((a, b) => b.runCount - a.runCount);
      break;
    case "success":
      sorted.sort((a, b) => b.successRate - a.successRate);
      break;
    case "recent":
      // Seed order is the library's own recency; keep it rather than parsing labels.
      break;
    // "name" is the default.
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

/** Ancestry path of a folder, e.g. "Shared / Monitoring / Synthetics". */
function folderPath(folderId: string): string {
  const names: string[] = [];
  let cur = allFolders.find((f) => f.id === folderId);
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? allFolders.find((f) => f.id === cur!.parentId) : undefined;
  }
  return names.join(" / ");
}

/* ----------------------------------------------------------------- folder tree */

function childrenOf(parentId: string | null, visibility: Visibility) {
  return allFolders.filter((f) => f.visibility === visibility && f.parentId === parentId);
}

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
      className="focusable group flex h-8 w-full items-center gap-1 rounded-lg pr-2 text-left transition-colors"
      style={{ paddingLeft: 6 + depth * 14, background: active ? "var(--color-transparent-hover)" : "transparent" }}
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

/** A selectable automation leaf inside the library tree (status dot + name, with
 *  the owner avatar trailing). */
function AutomationLeaf({
  automation,
  depth,
  active,
  onSelect,
}: {
  automation: Automation;
  depth: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { memberById } = useStore();
  const owner = memberById(automation.ownerId);
  const accent = AUTOMATION_STATUS_ACCENT[automation.status];
  return (
    <TreeRow
      depth={depth}
      icon={<span className="size-2 rounded-full" style={{ background: `var(--${accent}-9)` }} />}
      label={automation.name}
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
 *  automations that live directly in it, rendered as leaf rows. */
function FolderBranch({
  folderId,
  depth,
  expanded,
  toggle,
  selectedId,
  onSelect,
  automations,
}: {
  folderId: string;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  automations: Automation[];
}) {
  const folder = allFolders.find((f) => f.id === folderId)!;
  const kids = allFolders.filter((f) => f.parentId === folderId);
  const autos = automations.filter((a) => a.folderId === folderId);
  const open = expanded.has(folderId);
  return (
    <>
      <TreeRow
        depth={depth}
        icon={<FolderIcon size={14} strokeWidth={1.8} />}
        label={folder.name}
        active={false}
        hasChildren={kids.length > 0 || autos.length > 0}
        open={open}
        onToggle={() => toggle(folderId)}
        onSelect={() => toggle(folderId)}
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
              automations={automations}
            />
          ))}
          {autos.map((a) => (
            <AutomationLeaf
              key={a.id}
              automation={a}
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

/** The automation library: a single left panel that merges the Public/Private
 *  folder tree with the automations inside each folder (as selectable leaves), so
 *  navigation and selection live in one column instead of two. While the
 *  workspace header narrows the page (a search or a filter), the tree flattens to
 *  the matches — the folders are structure, not a second filter. */
function AutomationLibrary({
  automations,
  narrowed,
  selectedId,
  onSelect,
}: {
  automations: Automation[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Default to fully expanded so the merged automations are visible up front.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set<string>(["vis:public", "vis:private", ...allFolders.map((f) => f.id)]),
  );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const roots: { visibility: Visibility; label: string; icon: ReactNode }[] = [
    { visibility: "public", label: "Public", icon: <Globe size={14} strokeWidth={1.8} /> },
    { visibility: "private", label: "Private", icon: <Lock size={14} strokeWidth={1.8} /> },
  ];

  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {narrowed ? (
          automations.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
              No automations match the current search or filters.
            </p>
          ) : (
            automations.map((a) => (
              <AutomationLeaf
                key={a.id}
                automation={a}
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
            const topFolders = childrenOf(null, root.visibility);
            return (
              <div key={root.visibility} className="mb-1">
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
                      automations={automations}
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

const DETAIL_TABS = ["History", "Dependencies"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

function AutomationDetail({ automation, onSelectAutomation }: { automation: Automation; onSelectAutomation: (id: string) => void }) {
  const { memberById, runsForAutomation, automationById, editAutomation, role } = useStore();
  const [tab, setTab] = useState<DetailTab>("History");
  const owner = memberById(automation.ownerId);
  const runs = runsForAutomation(automation.id);

  return (
    <>
      {/* Tabbed pane — primary detail */}
      <DetailPane>
        <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
          <SegmentedControl
            variant="ghost"
            ariaLabel="Automation detail"
            segments={DETAIL_TABS.map((t) => ({ id: t, label: t, badge: t === "History" ? runs.length : undefined }))}
            value={tab}
            onChange={(id) => setTab(id as DetailTab)}
          />
        </div>

        {tab === "History" ? (
          <div key="history" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-4 py-3">
            {runs.length === 0 ? (
              <p className="py-16 text-center text-body-sm text-tertiary-foreground">No runs recorded yet.</p>
            ) : (
              runs.map((r) => <RunRow key={r.id} run={r} />)
            )}
          </div>
        ) : (
          <div key="deps" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-xl flex-col gap-8">
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-body-base font-medium text-primary-foreground">Packages</h3>
                  <span className="text-body-sm text-tertiary-foreground">
                    Derived from the {automation.steps.length} step{automation.steps.length === 1 ? "" : "s"} in the flow.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {automation.packages.map((p) => (
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
                {automation.references.length === 0 ? (
                  <p className="text-body-sm text-tertiary-foreground">This automation references no others.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {automation.references.map((rid) => {
                      const ref = automationById(rid);
                      if (!ref) return null;
                      return (
                        <button
                          key={rid}
                          type="button"
                          onClick={() => onSelectAutomation(rid)}
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
              <Workflow size={22} strokeWidth={1.7} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">{automation.id}</span>
              <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{automation.name}</h2>
              <p className="text-body-base text-secondary-foreground">{automation.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="pressable focusable inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-medium"
                style={{ background: "var(--color-brand-solid)", color: "#fff" }}
              >
                <Play size={14} strokeWidth={2} />
                Run now
              </button>
              {role !== "user" && (
                <button
                  type="button"
                  onClick={() => editAutomation(automation.id)}
                  className="pressable focusable inline-flex w-fit items-center gap-1.5 rounded-lg border-border-default border-[0.5px] px-3 py-1.5 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
                >
                  <Pencil size={14} strokeWidth={1.8} />
                  Edit flow
                </button>
              )}
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Status">
              <AutomationStatusChip status={automation.status} />
            </MetaRow>
            <MetaRow label="Owner">
              <span className="inline-flex items-center gap-1.5">
                {owner && <Avatar member={owner} size={18} />}
                {owner?.name}
              </span>
            </MetaRow>
            <MetaRow label="Visibility">
              <span className="inline-flex items-center gap-1.5 capitalize">
                {automation.visibility === "public" ? (
                  <Globe size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                ) : (
                  <Lock size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
                )}
                {automation.visibility}
              </span>
            </MetaRow>
            <MetaRow label="Folder">
              <span className="truncate">{folderPath(automation.folderId)}</span>
            </MetaRow>
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <div className="flex flex-col gap-1">
            <MetaRow label="Total runs">
              <span>{num(automation.runCount)}</span>
            </MetaRow>
            <MetaRow label="Success rate">
              <span>{pct(automation.successRate)}</span>
            </MetaRow>
            <MetaRow label="Last run">
              <span>{automation.lastRunAt}</span>
            </MetaRow>
            <MetaRow label="Updated">
              <span>{automation.updatedAgo}</span>
            </MetaRow>
          </div>
        </div>
      </ContextPane>
    </>
  );
}

/* ------------------------------------------------------------------------ view */

/* ------------------------------------------------------------------- board mode */

const AUTOMATION_STATUSES: AutomationStatus[] = ["Active", "Paused", "Draft"];

/** Board presentation: automations laid out in columns by lifecycle status.
 *  Selecting a card returns to the list focused on that automation — mirroring the
 *  inbox board → detail flow. */
function AutomationsBoard({ items, onSelect }: { items: Automation[]; onSelect: (id: string) => void }) {
  const { memberById } = useStore();
  const columns = useMemo(() => {
    const by = new Map<AutomationStatus, Automation[]>();
    for (const a of items) {
      const arr = by.get(a.status) ?? [];
      arr.push(a);
      by.set(a.status, arr);
    }
    return AUTOMATION_STATUSES.map((status) => ({ status, items: by.get(status) ?? [] }));
  }, [items]);

  return (
    <DetailPane>
      <div
        className="scrollbar-none flex min-w-0 flex-1 gap-5 overflow-x-auto p-5"
        style={{ background: "color-mix(in srgb, var(--color-primary-foreground) 3%, transparent)" }}
      >
        {columns.map((col) => {
          const accent = AUTOMATION_STATUS_ACCENT[col.status];
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

/** Automations — the first-class automation library. List mode is the shared shell
 *  with one merged left panel (the Public/Private folder tree and the automations
 *  inside each folder together) → run-history / dependencies detail → collapsible
 *  summary. Board mode fills the panel with a status board (like the inbox board).
 *  Failed runs link back to the incidents they spawned. */
export function AutomationsView() {
  const { automations, viewMode, selectedAutomationId, selectAutomation, controls } = useStore();
  const state = controls("automations");
  const visible = visibleAutomations(automations, state);
  const selected = selectedAutomationId
    ? automations.find((a) => a.id === selectedAutomationId) ?? null
    : null;

  // Board layout: the status board fills the panel; opening an automation shows its
  // detail (the board is hidden) — deselect via the breadcrumb returns to the board.
  if (viewMode("automations") === "board") {
    return (
      <SplitView>
        {selected ? (
          <AutomationDetail automation={selected} onSelectAutomation={selectAutomation} />
        ) : (
          <AutomationsBoard items={visible} onSelect={selectAutomation} />
        )}
      </SplitView>
    );
  }

  return (
    <SplitView>
      <AutomationLibrary
        automations={visible}
        narrowed={isNarrowed(state)}
        selectedId={selectedAutomationId}
        onSelect={selectAutomation}
      />
      {selected ? (
        <AutomationDetail automation={selected} onSelectAutomation={selectAutomation} />
      ) : (
        <EmptyDetail>Select an automation.</EmptyDetail>
      )}
    </SplitView>
  );
}
