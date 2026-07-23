import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Folder as FolderIcon,
  Globe,
  Link2,
  Lock,
  Package,
  Play,
  Plus,
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

/* ------------------------------------------------------------------ shared bits */

const pct = (r: number) => `${Math.round(r * 100)}%`;

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

/* --------------------------------------------------------------- selection model */

/** A selected tree node: a whole visibility root, or a specific folder. */
type TreeSel = { kind: "vis"; visibility: Visibility } | { kind: "folder"; id: string };

/* ----------------------------------------------------------------- folder tree */

function childrenOf(parentId: string | null, visibility: Visibility) {
  return allFolders.filter((f) => f.visibility === visibility && f.parentId === parentId);
}

/** Every folder id at or beneath `folderId` (so selecting a folder includes its subtree). */
function subtreeIds(folderId: string): string[] {
  const out = [folderId];
  for (const child of allFolders.filter((f) => f.parentId === folderId)) {
    out.push(...subtreeIds(child.id));
  }
  return out;
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
}: {
  depth: number;
  icon: ReactNode;
  label: string;
  active: boolean;
  hasChildren: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: () => void;
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
        <span className="shrink-0 text-tertiary-foreground">{icon}</span>
        <span className="truncate text-body-sm text-primary-foreground">{label}</span>
      </button>
    </div>
  );
}

function FolderBranch({
  folderId,
  depth,
  expanded,
  toggle,
  sel,
  onSelect,
}: {
  folderId: string;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  sel: TreeSel;
  onSelect: (s: TreeSel) => void;
}) {
  const folder = allFolders.find((f) => f.id === folderId)!;
  const kids = allFolders.filter((f) => f.parentId === folderId);
  const open = expanded.has(folderId);
  const active = sel.kind === "folder" && sel.id === folderId;
  return (
    <>
      <TreeRow
        depth={depth}
        icon={<FolderIcon size={14} strokeWidth={1.8} />}
        label={folder.name}
        active={active}
        hasChildren={kids.length > 0}
        open={open}
        onToggle={() => toggle(folderId)}
        onSelect={() => onSelect({ kind: "folder", id: folderId })}
      />
      {open &&
        kids.map((k) => (
          <FolderBranch
            key={k.id}
            folderId={k.id}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            sel={sel}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function FolderTree({ sel, onSelect }: { sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["vis:public", "vis:private", "pub-root", "pub-monitoring", "prv-root"]),
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
    <Pane width={PANE_WIDTH.nav}>
      <div className="border-border-default border-b-[0.5px] px-3 py-3">
        <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
          Library
        </span>
      </div>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {roots.map((root) => {
          const visKey = `vis:${root.visibility}`;
          const open = expanded.has(visKey);
          const active = sel.kind === "vis" && sel.visibility === root.visibility;
          const topFolders = childrenOf(null, root.visibility);
          return (
            <div key={root.visibility} className="mb-1">
              <TreeRow
                depth={0}
                icon={root.icon}
                label={root.label}
                active={active}
                hasChildren={topFolders.length > 0}
                open={open}
                onToggle={() => toggle(visKey)}
                onSelect={() => onSelect({ kind: "vis", visibility: root.visibility })}
              />
              {open &&
                topFolders.map((f) => (
                  <FolderBranch
                    key={f.id}
                    folderId={f.id}
                    depth={1}
                    expanded={expanded}
                    toggle={toggle}
                    sel={sel}
                    onSelect={onSelect}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </Pane>
  );
}

/* ------------------------------------------------------------- automation list */

function AutomationList({
  items,
  selectedId,
  onSelect,
}: {
  items: Automation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { memberById, role } = useStore();
  const canCreate = role !== "user";

  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-2.5">
        <span className="text-body-sm font-medium text-secondary-foreground">Automations</span>
        <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{items.length}</span>
        {canCreate && (
          <button
            type="button"
            className="pressable focusable ml-auto inline-flex items-center gap-1 rounded-lg border-border-default border-[0.5px] px-2 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover"
          >
            <Plus size={14} strokeWidth={2} />
            New
          </button>
        )}
      </div>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {items.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">No automations in this folder.</p>
        )}
        <div className="flex flex-col gap-0.5">
          {items.map((a) => {
            const owner = memberById(a.ownerId);
            const active = a.id === selectedId;
            const accent = AUTOMATION_STATUS_ACCENT[a.status];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a.id)}
                aria-current={active ? "true" : undefined}
                className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-body-sm text-primary-foreground">{a.name}</span>
                  <span className="truncate text-[0.72rem] text-tertiary-foreground">
                    {pct(a.successRate)} success · {a.lastRunAt}
                  </span>
                </div>
                {owner && <Avatar member={owner} size={20} />}
              </button>
            );
          })}
        </div>
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
  const { memberById, runsForAutomation, automationById } = useStore();
  const [tab, setTab] = useState<DetailTab>("History");
  const owner = memberById(automation.ownerId);
  const runs = runsForAutomation(automation.id);

  return (
    <>
      {/* Tabbed pane — primary detail */}
      <DetailPane>
        <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
          {DETAIL_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="focusable rounded-md px-2.5 py-1 text-body-sm transition-colors"
              style={{
                background: tab === t ? "var(--color-transparent-hover)" : "transparent",
                color: tab === t ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t}
              {t === "History" && (
                <span className="ml-1.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">{runs.length}</span>
              )}
            </button>
          ))}
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
                <h3 className="text-body-base font-medium text-primary-foreground">Packages</h3>
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
            <button
              type="button"
              className="pressable focusable inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-medium"
              style={{ background: "var(--color-brand-solid)", color: "#fff" }}
            >
              <Play size={14} strokeWidth={2} />
              Run now
            </button>
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

/** Automations — the first-class automation library: a Public/Private folder tree,
 *  the automations within the selected folder, and a run-history / dependencies
 *  detail. List mode uses the shared shell (list → detail → collapsible summary);
 *  board mode groups automations by lifecycle status. Failed runs link back to the
 *  incidents they spawned. */
export function AutomationsView() {
  const { automations, viewMode, setViewMode } = useStore();
  const [sel, setSel] = useState<TreeSel>({ kind: "vis", visibility: "public" });
  const [selectedId, setSelectedId] = useState<string | null>(automations[0]?.id ?? null);

  const visibleAutomations = useMemo(() => {
    if (sel.kind === "vis") return automations.filter((a) => a.visibility === sel.visibility);
    const ids = new Set(subtreeIds(sel.id));
    return automations.filter((a) => ids.has(a.folderId));
  }, [automations, sel]);

  const selected = automations.find((a) => a.id === selectedId) ?? null;
  const board = viewMode("automations") === "board";

  return (
    <SplitView>
      <FolderTree sel={sel} onSelect={setSel} />
      {board ? (
        <AutomationsBoard
          items={visibleAutomations}
          onSelect={(id) => {
            setSelectedId(id);
            setViewMode("automations", "list");
          }}
        />
      ) : (
        <>
          <AutomationList items={visibleAutomations} selectedId={selectedId} onSelect={setSelectedId} />
          {selected ? (
            <AutomationDetail automation={selected} onSelectAutomation={setSelectedId} />
          ) : (
            <EmptyDetail>Select an automation.</EmptyDetail>
          )}
        </>
      )}
    </SplitView>
  );
}
