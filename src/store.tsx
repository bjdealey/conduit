import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { issues as seedIssues, members } from "./data/issues";
import { workflows as seedWorkflows, folders as seedFolders, runs as seedRuns } from "./data/workflows";
import { endUsers } from "./data/users";
import { runners } from "./data/runners";
import { currentUser } from "./data/user";
import { workspaces } from "./data/workspaces";
import type { Workspace } from "./data/workspaces";
import { palettes, type Palette } from "./data/palettes";
import { VIEW_MODES } from "./data/viewLayout";
import { applyBrand } from "./lib/palette";
import { isDark, setTheme } from "./lib/theme";
import type { Workflow, WorkflowDraft, Folder, Issue, Member, Priority, Role, Run, Status } from "./data/types";
import { blankDraft, commitDraft, testRun } from "./lib/builder";
import {
  CAPABILITIES,
  Capability,
  can,
  canTransition,
  latestVersion,
  transitionsFrom,
  type Permission,
  type ReviewAction,
  type Workflow as DomainWorkflow,
} from "@conduit/domain";
import { EMPTY_WORKSPACE, type FilterOp, type SortDir, type WorkspaceState } from "./lib/workspace";
import { isSupabaseConfigured } from "./lib/supabase";
import { getWorkflows, getCapabilities } from "./lib/api";
import { seedConnectedWorkflows } from "./data/toDomain";

const read = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

/** Top-level navigation destinations (the sidebar rail), plus the two full-screen
 *  modes that aren't destinations: Settings and the workflow builder. They're
 *  views so they inherit the shared chrome — the workspace header's search and
 *  filters, the layout switcher, and the info-pane toggle — rather than each
 *  reinventing it. */
export type View =
  | "home"
  | "activity"
  | "inbox"
  | "workflows"
  | "review"
  | "manage"
  | "users"
  | "administration"
  | "surfaces"
  | "runners"
  | "settings"
  | "builder";

type Store = {
  issues: Issue[];
  members: Member[];
  /** Workflow library (first-class entity), its folder tree, and run history. */
  workflows: Workflow[];
  folders: Folder[];
  runs: Run[];
  workflowById: (id: string) => Workflow | undefined;
  runById: (id: string) => Run | undefined;
  /** The workflow open in the builder, or null when it isn't showing. The
   *  builder is a full-screen mode over the workspace, not a nav destination. */
  draft: WorkflowDraft | null;
  /** Open the builder on a blank workflow. */
  newWorkflow: () => void;
  /** Open the builder on an existing workflow. */
  editWorkflow: (id: string) => void;
  updateDraft: (patch: Partial<WorkflowDraft>) => void;
  /** Commit the draft to the library and open it. Returns its id. */
  saveDraft: () => string | null;
  /** Save the draft, then start a manual run of it and jump to Activity. */
  testRunDraft: () => void;
  closeBuilder: () => void;
  /** Runs for one workflow, newest first (seed order). */
  runsForWorkflow: (workflowId: string) => Run[];
  /** Canonical domain bots from our API (live) or the seed fallback. */
  /** The estate as our API reports it — every enabled connector's workflows,
   *  normalised. The same entity as `workflows` above, at the fidelity that crosses
   *  the API boundary; the two converge once the library reads from the API. */
  connectedWorkflows: DomainWorkflow[];
  /** Capability ids the enabled connectors declare — the UI enables features from
   *  this union, never from a connector's vendor identity. */
  capabilities: Capability[];
  /** Whether a capability is currently enabled (drives capability-gated UI). */
  hasCapability: (capability: Capability) => boolean;
  /** Where `bots` + capabilities come from: our live API, or in-memory seed data. */
  dataSource: "live" | "seed";
  /** Set when a live load failed and the app fell back to seed data. */
  integrationError: string | null;
  /** The signed-in user's tier — gates permission-scoped UI. Switchable in Settings
   *  so the three-tier model is demonstrable in the prototype. */
  role: Role;
  setRole: (r: Role) => void;
  /** Whether the current tier holds a permission. Every gate reads this rather than
   *  comparing role strings, so a new tier never means hunting for `role === …`. */
  allowed: (permission: Permission) => boolean;
  /** Move a workflow through the review lifecycle. Refuses any move the current tier
   *  isn't permitted to make, so the store enforces the same rule the UI renders. */
  reviewWorkflow: (id: string, action: ReviewAction, note?: string) => void;
  selectedId: number | null;
  selected: Issue | null;
  /** Selected end-user (Users view) and workflow (Workflows view). Lifted here
   *  so the titlebar breadcrumb can show them and so board/grid modes can swap the
   *  collection for the item's detail, like the inbox does. Null = nothing opened. */
  selectedUserId: string | null;
  selectUser: (id: string | null) => void;
  selectedWorkflowId: string | null;
  selectWorkflow: (id: string | null) => void;
  selectedRunnerId: string | null;
  selectRunner: (id: string | null) => void;
  /** Run opened from the Activity timeline. Null = the timeline itself is showing
   *  (the list layout expands runs in place instead, and ignores this). */
  selectedRunId: string | null;
  selectRun: (id: string | null) => void;
  /** The shared workspace header's state for a page: search, filters, and sort.
   *  One record per view, so each page keeps its own narrowing as you navigate.
   *  (Named `controls` because `workspace` is the tenant workspace.) */
  controls: (v: View) => WorkspaceState;
  setControlsQuery: (v: View, query: string) => void;
  /** Apply a filter option (with an optional operator), or pass null to drop it. */
  setControlsFilter: (v: View, filterId: string, value: string | null, op?: FilterOp) => void;
  /** Choose a sort, and optionally its direction (omit to use the sort's own). */
  setControlsSort: (v: View, sortId: string, dir?: SortDir | "") => void;
  /** Reset everything the filter bar shows: the search, the filters, and the sort
   *  (back to the page's default). */
  clearControls: (v: View) => void;
  /** Active section tab for the tabbed pages (Manage, Administration). Lifted here
   *  so the workspace header's controls can follow the objects on screen. */
  sectionTab: (v: View) => string;
  setSectionTab: (v: View, tab: string) => void;
  view: View;
  /** Active subpage id within the current view, or null. */
  subview: string | null;
  sidebarExpanded: boolean;
  /** Global layout preference shared by every page's view switcher: the primary
   *  "list" layout, or each page's alternate (board/grid). One control, so the
   *  choice persists as you move between pages. */
  layout: "list" | "alt";
  setLayout: (l: "list" | "alt") => void;
  /** Resolve a view's current mode id from the global layout and its declared
   *  modes (`VIEW_MODES`) — e.g. "list" or, for the alternate, "board"/"grid". */
  viewMode: (v: View) => string;
  /** Whether the right-hand context ("more info") pane is shown. Toggled from the
   *  titlebar and shared by every view that has one. Persisted. */
  infoPaneOpen: boolean;
  setInfoPaneOpen: (on: boolean) => void;
  toggleInfoPane: () => void;
  workspaces: Workspace[];
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
  /** Issues opened in the current session, pinned in the sidebar (in open order). */
  openIds: number[];
  select: (id: number | null) => void;
  setView: (v: View) => void;
  openSubview: (v: View, sub: string) => void;
  /** Leave the full-screen Settings mode, returning to the previous view. */
  exitSettings: () => void;
  toggleSidebar: () => void;
  /** Remove an issue from the open/pinned list (and pick a neighbour if it was open). */
  closeIssue: (id: number) => void;
  /** Appearance preferences. */
  backgroundEnabled: boolean;
  setBackgroundEnabled: (on: boolean) => void;
  /** Show hairline borders around navigation buttons (outlined look). */
  bordersEnabled: boolean;
  setBordersEnabled: (on: boolean) => void;
  /** Show count badges on the sidebar navigation tabs. */
  badgesEnabled: boolean;
  setBadgesEnabled: (on: boolean) => void;
  palettes: Palette[];
  palette: Palette;
  setPaletteId: (id: string) => void;
  /** Command palette (universal search). */
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  /** Light/dark theme (mirrors the `dark` class on <html>). */
  dark: boolean;
  toggleTheme: () => void;
  /** Auth gate (temporary — any email/provider signs in; persisted locally). */
  authed: boolean;
  signIn: () => void;
  signOut: () => void;
  memberById: (id: string) => Member | undefined;
  updateIssue: (id: number, patch: Partial<Pick<Issue, "status" | "priority" | "assigneeId">>) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>(seedIssues);
  // The library and its run history are editable in the prototype: the builder
  // writes workflows, and a test run appends to the stream.
  const [workflows, setWorkflows] = useState<Workflow[]>(seedWorkflows);
  const [runs, setRuns] = useState<Run[]>(seedRuns);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(seedIssues[0]?.id ?? null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(endUsers[0]?.id ?? null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(seedWorkflows[0]?.id ?? null);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(runners[0]?.id ?? null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [controlState, setControlState] = useState<Partial<Record<View, WorkspaceState>>>({});
  const [sectionTabs, setSectionTabs] = useState<Partial<Record<View, string>>>({});

  // Patch one page's control state, leaving every other page's untouched.
  const patchControls = (v: View, patch: Partial<WorkspaceState>) =>
    setControlState((prev) => ({ ...prev, [v]: { ...EMPTY_WORKSPACE, ...prev[v], ...patch } }));
  const [view, setViewRaw] = useState<View>("home");
  const [subview, setSubview] = useState<string | null>(null);
  const [settingsReturn, setSettingsReturn] = useState<View>("home");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  // Global layout preference (list vs each page's board/grid alternate).
  const [layout, setLayoutState] = useState<"list" | "alt">(() => (read("layout", "list") === "alt" ? "alt" : "list"));
  const [infoPaneOpen, setInfoPaneState] = useState(() => read("info-pane", "on") !== "off");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0].id);
  const [openIds, setOpenIds] = useState<number[]>(selectedId != null ? [selectedId] : []);

  // Integration data plane. Defaults to the seed-derived domain view (so the prototype
  // runs with no backend); if Supabase is configured, live data replaces it on mount.
  const [connectedWorkflows, setConnectedWorkflows] = useState<DomainWorkflow[]>(() => seedConnectedWorkflows());
  const [capabilitySet, setCapabilitySet] = useState<Set<Capability>>(() => new Set(CAPABILITIES));
  const [dataSource, setDataSource] = useState<"live" | "seed">("seed");
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const [caps, live] = await Promise.all([getCapabilities(), getWorkflows()]);
        if (cancelled) return;
        setCapabilitySet(new Set(caps));
        setConnectedWorkflows(live);
        setDataSource("live");
        setIntegrationError(null);
      } catch (e) {
        if (cancelled) return;
        // Keep the seed fallback visible; surface the reason on the Integrations page.
        setIntegrationError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Appearance preferences (persisted).
  const [backgroundEnabled, setBgState] = useState(() => read("bg-enabled", "on") !== "off");
  const [bordersEnabled, setBordersState] = useState(() => read("borders-enabled", "off") === "on");
  const [badgesEnabled, setBadgesState] = useState(() => read("badges-enabled", "on") !== "off");
  const [paletteId, setPaletteState] = useState(() => read("palette", palettes[0].id));
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(() => isDark());
  const [role, setRoleState] = useState<Role>(() => read("role", currentUser.role) as Role);
  const [authed, setAuthed] = useState(() => read("authed", "no") === "yes");
  const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];

  const setBackgroundEnabled = (on: boolean) => {
    setBgState(on);
    write("bg-enabled", on ? "on" : "off");
  };
  const setBordersEnabled = (on: boolean) => {
    setBordersState(on);
    write("borders-enabled", on ? "on" : "off");
  };
  const setBadgesEnabled = (on: boolean) => {
    setBadgesState(on);
    write("badges-enabled", on ? "on" : "off");
  };
  const setPaletteId = (id: string) => {
    setPaletteState(id);
    write("palette", id);
  };

  // Apply the palette's accent to the app's brand tokens whenever it changes.
  useEffect(() => {
    applyBrand(palette.accent);
  }, [palette.accent]);

  const memberIndex = useMemo(() => new Map(members.map((m) => [m.id, m])), []);

  // Navigating to a top-level page clears any active subpage. Entering a
  // full-screen mode (Settings, the builder) remembers the view to return to;
  // leaving the builder for anywhere else drops the draft with it.
  const enter = (v: View) => {
    if ((v === "settings" || v === "builder") && view !== v) setSettingsReturn(view);
    if (view === "builder" && v !== "builder") setDraft(null);
    setViewRaw(v);
  };
  const setView = (v: View) => {
    enter(v);
    setSubview(null);
  };
  const openSubview = (v: View, sub: string) => {
    enter(v);
    setSubview(sub);
  };
  const exitSettings = () => setView(settingsReturn);

  // Selecting an issue also pins it to the sidebar's open list.
  const select = (id: number | null) => {
    setSelectedId(id);
    if (id != null) setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const closeIssue = (id: number) => {
    setOpenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      if (selectedId === id) setSelectedId(next.length ? next[next.length - 1] : null);
      return next;
    });
  };

  const value: Store = {
    issues,
    members,
    workflows,
    folders: seedFolders,
    runs,
    workflowById: (id) => workflows.find((a) => a.id === id),
    runById: (id) => runs.find((r) => r.id === id),
    runsForWorkflow: (id) => runs.filter((r) => r.workflowId === id),
    draft,
    // New work lands in the private Drafts folder. The signed-in demo account
    // isn't one of the team members, so ownership defaults to the first and is
    // editable in the builder.
    newWorkflow: () => {
      setDraft(blankDraft(members[0]?.id ?? "", "prv-drafts"));
      if (view !== "builder") setSettingsReturn(view);
      setViewRaw("builder");
    },
    editWorkflow: (id) => {
      const workflow = workflows.find((a) => a.id === id);
      // A mirrored workflow is a reflection of another platform's flow. We can
      // observe it and plan its move; we cannot author it here.
      if (!workflow || workflow.platform !== "conduit") return;
      setDraft({ ...workflow, isNew: false });
      if (view !== "builder") setSettingsReturn(view);
      setViewRaw("builder");
    },
    updateDraft: (patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev)),
    saveDraft: () => {
      if (!draft) return null;
      const { workflows: next, id } = commitDraft(workflows, draft, currentUser.name);
      setWorkflows(next);
      setSelectedWorkflowId(id);
      setDraft(null);
      setViewRaw("workflows");
      return id;
    },
    testRunDraft: () => {
      if (!draft) return;
      const { workflows: next, id } = commitDraft(workflows, draft, currentUser.name);
      const saved = next.find((a) => a.id === id)!;
      setWorkflows(next.map((a) => (a.id === id ? { ...a, runCount: a.runCount + 1, lastRunAt: "just now" } : a)));
      setRuns((prev) => [testRun(saved, currentUser.name, prev, runners), ...prev]);
      setSelectedWorkflowId(id);
      setDraft(null);
      setViewRaw("activity");
    },
    closeBuilder: () => {
      setDraft(null);
      setViewRaw(settingsReturn === "builder" ? "workflows" : settingsReturn);
    },
    connectedWorkflows,
    capabilities: [...capabilitySet],
    hasCapability: (capability) => capabilitySet.has(capability),
    dataSource,
    integrationError,
    role,
    setRole: (r) => {
      setRoleState(r);
      write("role", r);
      // A demoted viewer loses any surface their new tier can't reach.
      if (!can(r, "administer") && view === "administration") {
        setViewRaw("home");
        setSubview(null);
      }
      if (!can(r, "review") && view === "review") {
        setViewRaw("home");
        setSubview(null);
      }
    },
    allowed: (permission) => can(role, permission),
    reviewWorkflow: (id, action, note) => {
      setWorkflows((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          // The same check the buttons are built from — a move the tier can't make is
          // refused here too, so the rule survives anyone reaching past the UI.
          if (!canTransition(role, w.status, action)) return w;
          const to = transitionsFrom(w.status).find((t) => t.action === action)!.to;
          const who = currentUser.name;
          const stamped =
            action === "submit"
              ? { submittedBy: who, submittedAt: "just now" }
              : action === "withdraw"
                ? {}
                : { reviewedBy: who, reviewedAt: "just now", reviewNote: note ?? w.reviewNote };
          // An approval or a publish attaches to the version it read, not to the
          // workflow — otherwise a later edit inherits a decision nobody made about it.
          const target = latestVersion(w.versions)?.version;
          const versions =
            target === undefined
              ? w.versions
              : w.versions.map((v) =>
                  v.version !== target
                    ? v
                    : action === "approve"
                      ? { ...v, approvedBy: who, approvedAt: "just now" }
                      : action === "publish"
                        ? { ...v, publishedAt: "just now" }
                        : v,
                );
          return { ...w, status: to, updatedAgo: "just now", versions, ...stamped };
        }),
      );
    },
    selectedId,
    selected: issues.find((i) => i.id === selectedId) ?? null,
    selectedUserId,
    selectUser: setSelectedUserId,
    selectedWorkflowId,
    selectWorkflow: setSelectedWorkflowId,
    selectedRunnerId,
    selectRunner: setSelectedRunnerId,
    selectedRunId,
    selectRun: setSelectedRunId,
    controls: (v) => controlState[v] ?? EMPTY_WORKSPACE,
    setControlsQuery: (v, query) => patchControls(v, { query }),
    setControlsFilter: (v, filterId, value, op) =>
      setControlState((prev) => {
        const current = prev[v] ?? EMPTY_WORKSPACE;
        const filters = { ...current.filters };
        if (value === null) delete filters[filterId];
        // Keep the operator when only the value changes, and vice versa.
        else filters[filterId] = { op: op ?? filters[filterId]?.op ?? "is", value };
        return { ...prev, [v]: { ...current, filters } };
      }),
    setControlsSort: (v, sort, dir) => patchControls(v, { sort, dir: dir ?? "" }),
    clearControls: (v) => patchControls(v, { query: "", filters: {}, sort: "", dir: "" }),
    sectionTab: (v) => sectionTabs[v] ?? "",
    setSectionTab: (v, tab) => setSectionTabs((prev) => ({ ...prev, [v]: tab })),
    view,
    subview,
    sidebarExpanded,
    layout,
    setLayout: (l) => {
      setLayoutState(l);
      write("layout", l);
    },
    viewMode: (v) => {
      const modes = VIEW_MODES[v];
      if (!modes || modes.length === 0) return "list";
      return layout === "list" ? modes[0].id : modes[1]?.id ?? modes[0].id;
    },
    infoPaneOpen,
    setInfoPaneOpen: (on) => {
      setInfoPaneState(on);
      write("info-pane", on ? "on" : "off");
    },
    toggleInfoPane: () =>
      setInfoPaneState((prev) => {
        const next = !prev;
        write("info-pane", next ? "on" : "off");
        return next;
      }),
    workspaces,
    workspace: workspaces.find((w) => w.id === workspaceId) ?? workspaces[0],
    setWorkspaceId,
    openIds,
    select,
    setView,
    openSubview,
    exitSettings,
    toggleSidebar: () => setSidebarExpanded((v) => !v),
    closeIssue,
    backgroundEnabled,
    setBackgroundEnabled,
    bordersEnabled,
    setBordersEnabled,
    badgesEnabled,
    setBadgesEnabled,
    palettes,
    palette,
    setPaletteId,
    searchOpen,
    openSearch: () => setSearchOpen(true),
    closeSearch: () => setSearchOpen(false),
    toggleSearch: () => setSearchOpen((v) => !v),
    dark,
    toggleTheme: () => {
      setDark((prev) => {
        const next = !prev;
        setTheme(next);
        return next;
      });
    },
    authed,
    signIn: () => {
      setAuthed(true);
      write("authed", "yes");
    },
    signOut: () => {
      setAuthed(false);
      write("authed", "no");
    },
    memberById: (id) => memberIndex.get(id),
    updateIssue: (id, patch) =>
      setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i))),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}

export type { Issue, Member, Priority, Status };
