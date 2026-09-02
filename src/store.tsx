import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  dataset,
  meAsMember,
  meAsPlatformUser,
  ME_ID,
  ME_PLATFORM_USER_ID,
  type Dataset,
} from "./data/dataset";
import { NEW_USER, initialsOf, userFromEmail, type CurrentUser } from "./data/user";
// `Credential` also names a DOM global, so these are imported explicitly rather
// than left to resolve — an unimported `Credential[]` silently means the browser's.
import type { Credential, EventTrigger, GlobalValue, Package, Schedule } from "./data/manage";
import type { License, PlatformUser, Policy, RoleDef } from "./data/admin";
import { workspaces } from "./data/workspaces";
import type { Workspace } from "./data/workspaces";
import { palettes, type Palette } from "./data/palettes";
import { VIEW_MODES } from "./data/viewLayout";
import { sectionOf, type Section } from "./data/nav";
import { applyBrand } from "./lib/palette";
import { isDark, setTheme } from "./lib/theme";
import type {
  ActivityEvent,
  Workflow,
  WorkflowDraft,
  Folder,
  Issue,
  LibraryFile,
  Member,
  Priority,
  Role,
  Run,
  Status,
} from "./data/types";
import {
  countUnder as countUnderNode,
  countUnderAll as countUnderAllNodes,
  createFile,
  createFolder,
  deleteNode as deleteInTree,
  deleteNodes as deleteManyInTree,
  freeName,
  moveNode as moveInTree,
  moveNodes as moveManyInTree,
  renameNode as renameInTree,
  type CreateResult,
  type EditResult,
  type LibraryNode,
  type LibraryTree,
  type MoveTarget,
} from "./lib/library";
import { blankDraft, commitDraft, controlPlaneNote, runEventsToActivity, startedRun } from "./lib/builder";
import { startRun } from "./lib/execution";
import { durationLabel } from "./lib/format";
import { subtreeIds } from "./lib/folders";
import { ACTIONS, type StepAction } from "./data/actions";
import {
  CAPABILITIES,
  Capability,
  REVIEW_ACTION_VERB,
  type AuditCategory,
  can,
  canTransition,
  categoryOfReviewAction,
  isTerminal,
  latestVersion,
  transitionsFrom,
  type AuditEntry,
  type Permission,
  type ReviewAction,
  type RunEvent,
  type Runner,
  type Workflow as DomainWorkflow,
} from "@conduit/domain";
import { EMPTY_WORKSPACE, type FilterOp, type SortDir, type WorkspaceState } from "./lib/workspace";
import { asDensity, asLayout, type LibraryDensity, type LibraryLayout } from "./data/libraryView";
import { isMobileNow, useIsMobile } from "./lib/responsive";
import { CONTEXT_LABEL } from "./data/viewLayout";
import { isSupabaseConfigured } from "./lib/supabase";
import { getWorkflows, getCapabilities, getNodeTypes, subscribeRunEvents } from "./lib/api";
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

/** The stored profile, narrowed on the way in. A value is only as trustworthy as
 *  the build that wrote it, so anything missing or malformed falls back to a fresh
 *  account rather than rendering `undefined` on the first screen. */
const readUser = (): CurrentUser => {
  try {
    const raw = JSON.parse(read("profile", "null")) as Partial<CurrentUser> | null;
    if (!raw || typeof raw.name !== "string" || typeof raw.email !== "string") return NEW_USER;
    return {
      name: raw.name,
      email: raw.email,
      initials: initialsOf(raw.name),
      role: NEW_USER.role,
    };
  } catch {
    return NEW_USER;
  }
};

const writeUser = (user: CurrentUser): void => write("profile", JSON.stringify(user));

/** Top-level navigation destinations (the sidebar rail), plus the two full-screen
 *  modes that aren't destinations: Settings and the workflow builder. They're
 *  views so they inherit the shared chrome — the workspace header's search and
 *  filters, the layout switcher, and the info-pane toggle — rather than each
 *  reinventing it.
 *
 *  A destination is a *place*, not a screen: Workflows, Activity and Governance
 *  each hold several (`NavItemDef.subpages`). The screen you are actually on is a
 *  `Section` (`data/nav`), which is what every per-page mechanism keys on. */
export type View =
  | "home"
  | "workflows"
  | "activity"
  | "runners"
  | "governance"
  | "settings"
  | "builder";

type Store = {
  /**
   * Whether the sample estate is loaded. Off by default: Conduit ships empty, and
   * every view is written to say so rather than to look broken. On, it loads the
   * demo estate so the prototype can be shown without building one first.
   * Persisted, and switching it replaces every collection (see `setDemoData`).
   */
  demoData: boolean;
  setDemoData: (on: boolean) => void;
  issues: Issue[];
  members: Member[];
  /** Workflow library (first-class entity), its folder tree, and run history. */
  workflows: Workflow[];
  folders: Folder[];
  /** The artefacts filed beside the workflows — connector configs, runbooks. Same
   *  tree, same folders; they are simply not runnable. */
  files: LibraryFile[];
  runs: Run[];
  /* The collections the views used to import straight from `src/data/*`. They live
     here now because whether they hold anything is a runtime decision (a clean
     install, or the sample estate) rather than a property of the module — and a
     module-scope import can't answer that. It is also the shape the library's
     reads will take once they come from the API. */
  runners: Runner[];
  schedules: Schedule[];
  eventTriggers: EventTrigger[];
  credentials: Credential[];
  packages: Package[];
  globalValues: GlobalValue[];
  platformUsers: PlatformUser[];
  licenses: License[];
  /** Tier definitions and the policy catalogue — product constants, present on a
   *  clean install as much as on a loaded one. */
  roleDefs: RoleDef[];
  policies: Policy[];
  workflowById: (id: string) => Workflow | undefined;
  runById: (id: string) => Run | undefined;
  runnerById: (id: string) => Runner | undefined;
  /** The workflow open in the builder, or null when it isn't showing. The
   *  builder is a full-screen mode over the workspace, not a nav destination. */
  draft: WorkflowDraft | null;
  /** Open the builder on a blank workflow, filed in `folderId` — the folder the
   *  library has open, so creating lands where you are rather than always in
   *  Drafts. Omitted, it falls back to Drafts. */
  newWorkflow: (folderId?: string) => void;
  /** Open the builder on an existing workflow. */
  editWorkflow: (id: string) => void;
  updateDraft: (patch: Partial<WorkflowDraft>) => void;
  /** Commit the draft to the library and open it. Returns its id. */
  saveDraft: () => string | null;
  /** Save the draft, then start a manual run of it and jump to Activity. */
  testRunDraft: () => void;
  closeBuilder: () => void;
  /**
   * Start a manual run of a saved workflow and open Activity on it.
   *
   * The run really executes: with a backend it is queued for the pool, and with none
   * the browser tab hosts the engine. Either way the log fills in as events arrive.
   * Returns the run's id, or null when the workflow can't be run from here (a mirrored
   * flow lives on its own platform).
   */
  runWorkflow: (workflowId: string) => string | null;
  /** Runs for one workflow, newest first (seed order). */
  runsForWorkflow: (workflowId: string) => Run[];
  /** The estate as our API reports it — every enabled connector's workflows,
   *  normalised. The same entity as `workflows` above, at the fidelity that crosses
   *  the API boundary; the two converge once the library reads from the API. */
  connectedWorkflows: DomainWorkflow[];
  /** Capability ids the enabled connectors declare — the UI enables features from
   *  this union, never from a connector's vendor identity. */
  capabilities: Capability[];
  /** Whether a capability is currently enabled (drives capability-gated UI). */
  hasCapability: (capability: Capability) => boolean;
  /** Where `connectedWorkflows` + capabilities come from: our live API, or in-memory seed data. */
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
  /** The audit trail, newest first. Append-only — every lifecycle move writes one. */
  audit: AuditEntry[];
  /** The builder palette. Served by our API when configured, else the compiled-in
   *  fallback — so a new node type is a row, never a frontend redeploy. */
  nodeTypes: StepAction[];
  selectedId: number | null;
  selected: Issue | null;
  /** Selected workflow (the library). Lifted here so the titlebar breadcrumb can
   *  show it and so board mode can swap the collection for the item's detail,
   *  like the issues list does. Null = nothing opened. */
  selectedWorkflowId: string | null;
  selectWorkflow: (id: string | null) => void;
  /** Folder opened from the library tree. A folder is a destination like anything
   *  else in the tree — selecting one shows what it holds. The library's detail
   *  pane shows one thing at a time, so opening a folder closes the open workflow
   *  and vice versa. */
  selectedFolderId: string | null;
  selectFolder: (id: string | null) => void;
  /** File opened from the library tree. One of workflow / folder / file is open
   *  at a time; selecting any of them closes the other two. */
  selectedFileId: string | null;
  selectFile: (id: string | null) => void;
  /* ---- editing the library tree ----------------------------------------
     Each returns null when the edit went through, or the reason it was refused —
     the same words the UI puts on screen. The rules themselves live in
     `src/lib/library.ts`; the store only applies the result and records it. */
  renameNode: (node: LibraryNode, name: string) => string | null;
  moveNode: (node: LibraryNode, target: MoveTarget) => string | null;
  deleteNode: (node: LibraryNode) => string | null;
  /** Create a folder / a file, and hand back its id so the caller can open it and
   *  drop straight into renaming it. */
  newFolder: (target: MoveTarget) => { id: string } | { reason: string };
  newFile: (folderId: string, extension: string) => { id: string } | { reason: string };
  /** What deleting a node would take with it — the folder's whole subtree, not
   *  just the row. */
  countUnder: (node: LibraryNode) => { folders: number; workflows: number; files: number };
  /* ---- selecting several rows -------------------------------------------
     The tree keeps two separate ideas, because they answer different questions.
     `treeSelection` is what a bulk action would act on; the `selected*Id` fields
     above are what the detail pane is showing. A plain click sets both, a
     modifier-click changes only the selection, and the row's info button changes
     only what's open — so a row can be inspected without disturbing a selection
     you spent several clicks building. */
  treeSelection: LibraryNode[];
  setTreeSelection: (nodes: LibraryNode[]) => void;
  /** Open a node in the detail pane *without* touching the selection — the row's
   *  info button. It wins over the selection summary while it lasts, because
   *  otherwise the one case the button exists for (reading a row without losing a
   *  selection you spent several clicks building) is the case it can't serve.
   *  Changing the selection ends it. */
  peekNode: (node: LibraryNode) => void;
  peeking: boolean;
  /** Everything a bulk delete would take, counted once even when the selection
   *  holds both a folder and something inside it. */
  countUnderAll: (nodes: LibraryNode[]) => { folders: number; workflows: number; files: number };
  /** Move / delete a whole selection. Returns how many went through and why each
   *  of the rest didn't — partial success is normal, and losing the successes
   *  because one node was mirrored would be the wrong trade. */
  moveNodes: (nodes: LibraryNode[], target: MoveTarget) => { moved: number; refusals: { name: string; reason: string }[] };
  deleteNodes: (nodes: LibraryNode[]) => { moved: number; refusals: { name: string; reason: string }[] };
  /** Which branches are open. Persisted, because a tree that re-expands itself on
   *  every reload is a tree you re-collapse on every reload. Keyed by folder id,
   *  plus `vis:public` / `vis:private` for the two section headers. */
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
  /** Open a branch without closing it if it already is — what selecting or
   *  creating inside it needs. */
  expand: (id: string) => void;
  /** The last library edit, if it can still be taken back. One level: the tree is
   *  small enough that a deep history is a feature nobody asked for, and a delete
   *  you can't reverse is the actual problem. */
  undoable: { label: string } | null;
  undo: () => void;
  selectedRunnerId: string | null;
  selectRunner: (id: string | null) => void;
  /** Run opened from the Activity timeline. Null = the timeline itself is showing
   *  (the list layout expands runs in place instead, and ignores this). */
  selectedRunId: string | null;
  selectRun: (id: string | null) => void;
  /** The shared workspace header's state for a page: search, filters, and sort.
   *  One record per *section*, so each screen keeps its own narrowing as you
   *  navigate — including two subpages of one destination, which is why this is
   *  keyed by `Section` rather than `View`.
   *  (Named `controls` because `workspace` is the tenant workspace.) */
  controls: (s: Section) => WorkspaceState;
  setControlsQuery: (s: Section, query: string) => void;
  /** Apply a filter option (with an optional operator), or pass null to drop it. */
  setControlsFilter: (s: Section, filterId: string, value: string | null, op?: FilterOp) => void;
  /** Choose a sort, and optionally its direction (omit to use the sort's own). */
  setControlsSort: (s: Section, sortId: string, dir?: SortDir | "") => void;
  /** Reset everything the filter bar shows: the search, the filters, and the sort
   *  (back to the page's default). */
  clearControls: (s: Section) => void;
  /** Active tab within a section (Activity's Runs, Administration's Users…).
   *  Lifted here so the workspace header's controls can follow the objects on
   *  screen. Keyed by section, so Governance's Audit tabs and its Administration
   *  tabs are two memories rather than one they'd overwrite. */
  sectionTab: (s: Section) => string;
  setSectionTab: (s: Section, tab: string) => void;
  view: View;
  /** Active subpage id within the current view, or null. */
  subview: string | null;
  /** The screen actually on show: the view, or `view/subpage` for a destination
   *  that has them. A null `subview` reads as the destination's first subpage, so
   *  this is never ambiguous about where you are. */
  section: Section;
  sidebarExpanded: boolean;
  /** Global layout preference shared by every page's view switcher: the primary
   *  "list" layout, or each page's alternate (board/grid). One control, so the
   *  choice persists as you move between pages. */
  layout: "list" | "alt";
  setLayout: (l: "list" | "alt") => void;
  /** Resolve a section's current mode id from the global layout and its declared
   *  modes (`VIEW_MODES`) — e.g. "list" or, for the alternate, "board"/"grid". */
  viewMode: (s: Section) => string;
  /** Whether the right-hand context ("more info") pane is shown. Toggled from the
   *  titlebar and shared by every view that has one. Persisted on desktop; on a
   *  phone it drives a bottom sheet and starts closed every time, because a sheet
   *  that restores itself over the content is a dialog nobody opened. */
  infoPaneOpen: boolean;
  setInfoPaneOpen: (on: boolean) => void;
  toggleInfoPane: () => void;
  /** What the current view's context pane holds ("Profile", "Configuration"…).
   *  One label for the titlebar's toggle and the phone's sheet title, so the
   *  control and the thing it opens agree. */
  contextLabel: string;
  /** Whether the viewport is phone-sized. Drives the shell swap: the bottom bar
   *  instead of the sidebar rail, and one pane at a time instead of two or three.
   *  Live — rotating a phone or resizing a window switches shells. */
  isMobile: boolean;
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
  /** How the library draws itself: the folder tree, or a flat list of the work
   *  inside it. A reading preference, not a permission — it changes what the
   *  rows are, never what you may do to them. */
  libraryLayout: LibraryLayout;
  setLibraryLayout: (layout: LibraryLayout) => void;
  /** How much room a library row takes. */
  libraryDensity: LibraryDensity;
  setLibraryDensity: (density: LibraryDensity) => void;
  /** Command palette (universal search). */
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  /** Light/dark theme (mirrors the `dark` class on <html>). */
  dark: boolean;
  toggleTheme: () => void;
  /** Auth gate (temporary — any email/provider signs in; persisted locally).
   *  `signIn` takes the address that was typed, when there was one: the profile a
   *  fresh install starts with is derived from it rather than shipped as a
   *  fixture. A provider button passes nothing and keeps whatever is stored. */
  authed: boolean;
  signIn: (email?: string) => void;
  signOut: () => void;
  /** The signed-in user — name, email, avatar initials, tier. Persisted. */
  currentUser: CurrentUser;
  /**
   * Edit the profile. `initials` are re-derived from the name rather than taken,
   * and the workspace's own rows for you (`members`/`platformUsers`) are updated
   * with it — otherwise renaming yourself in Settings leaves the old name on every
   * avatar and in the admin table, which is where you'd go to check it worked.
   */
  updateProfile: (patch: Partial<Pick<CurrentUser, "name" | "email">>) => void;
  memberById: (id: string) => Member | undefined;
  updateIssue: (id: number, patch: Partial<Pick<Issue, "status" | "priority" | "assigneeId">>) => void;
};

const StoreContext = createContext<Store | null>(null);

/** The opening selection for a list/detail view.
 *
 *  On desktop the first row is pre-opened, so a page never lands on an empty
 *  detail pane beside a full list. On a phone that same default would land you
 *  *inside* the first workflow rather than on the library — the list is the page
 *  there, and a detail is somewhere you go. Read synchronously so the very first
 *  paint is already right; correcting it after mount would flash the detail. */
const openOnDesktop = <T,>(value: T | null): T | null => (isMobileNow() ? null : value);

export function StoreProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  // Conduit ships empty. `demo` loads the sample estate instead — see
  // `src/data/dataset.ts` for what each contains and why "empty" still has the
  // two visibility roots and one account in it.
  const [demoData, setDemoDataState] = useState(() => read("demo-data", "off") === "on");
  // Who is signed in. Read once for the initial dataset; edits go through
  // `updateProfile`, which also updates the workspace's own rows for you.
  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => readUser());
  const seed: Dataset = useMemo(
    () => dataset(demoData, currentUser),
    // Only the *initial* dataset depends on the profile. Re-deriving it on every
    // edit would throw away everything authored since, so `updateProfile` patches
    // the two rows that name you instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoData],
  );

  const [issues, setIssues] = useState<Issue[]>(seed.issues);
  const [members, setMembers] = useState<Member[]>(seed.members);
  // The library and its run history are editable in the prototype: the builder
  // writes workflows, and a test run appends to the stream.
  const [workflows, setWorkflows] = useState<Workflow[]>(seed.workflows);
  // The tree itself is editable now, so its folders and files are state rather
  // than the constants they start from.
  const [folders, setFolders] = useState<Folder[]>(seed.folders);
  const [files, setFiles] = useState<LibraryFile[]>(seed.files);
  const [runs, setRuns] = useState<Run[]>(seed.runs);
  const [runners, setRunners] = useState<Runner[]>(seed.runners);
  const [schedules, setSchedules] = useState<Schedule[]>(seed.schedules);
  const [eventTriggers, setEventTriggers] = useState<EventTrigger[]>(seed.eventTriggers);
  const [credentials, setCredentials] = useState<Credential[]>(seed.credentials);
  const [packages, setPackages] = useState<Package[]>(seed.packages);
  const [globalValues, setGlobalValues] = useState<GlobalValue[]>(seed.globalValues);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>(seed.platformUsers);
  const [licenses, setLicenses] = useState<License[]>(seed.licenses);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => openOnDesktop(seed.issues[0]?.id ?? null));
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(() =>
    openOnDesktop(seed.workflows[0]?.id ?? null),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [treeSelection, setTreeSelectionState] = useState<LibraryNode[]>(() =>
    seed.workflows[0] && !isMobileNow() ? [{ kind: "workflow", id: seed.workflows[0].id }] : [],
  );
  const [peeking, setPeeking] = useState(false);
  // Which branches are open. Nothing stored yet means everything open — the shape
  // of the library is the first thing worth seeing.
  const [expanded, setExpandedState] = useState<Set<string>>(() => {
    const stored = read("tree-expanded", "");
    if (stored === "") return new Set(["vis:public", "vis:private", ...seed.folders.map((f) => f.id)]);
    try {
      return new Set<string>(JSON.parse(stored));
    } catch {
      return new Set(["vis:public", "vis:private", ...seed.folders.map((f) => f.id)]);
    }
  });
  const persistExpanded = (next: Set<string>) => {
    setExpandedState(next);
    write("tree-expanded", JSON.stringify([...next]));
  };
  // One step of history: the tree as it was, plus what was open in it, so undoing
  // a delete puts back the thing you were looking at and not just the row.
  const [undoStack, setUndoStack] = useState<
    | {
        label: string;
        tree: LibraryTree;
        selection: { workflow: string | null; folder: string | null; file: string | null };
      }
    | null
  >(null);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(() =>
    openOnDesktop(seed.runners[0]?.id ?? null),
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [controlState, setControlState] = useState<Partial<Record<Section, WorkspaceState>>>({});
  const [sectionTabs, setSectionTabs] = useState<Partial<Record<Section, string>>>({});

  // Patch one section's control state, leaving every other section's untouched.
  const patchControls = (s: Section, patch: Partial<WorkspaceState>) =>
    setControlState((prev) => ({ ...prev, [s]: { ...EMPTY_WORKSPACE, ...prev[s], ...patch } }));
  const [view, setViewRaw] = useState<View>("home");
  const [subview, setSubview] = useState<string | null>(null);
  // The screen actually showing. Derived rather than stored: a stored copy would
  // be a third thing to keep in step with `view` and `subview`, and it would be
  // wrong for exactly one render every time either changes.
  const section = sectionOf(view, subview);
  const [settingsReturn, setSettingsReturn] = useState<View>("home");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  // Global layout preference (list vs each page's board/grid alternate).
  const [layout, setLayoutState] = useState<"list" | "alt">(() => (read("layout", "list") === "alt" ? "alt" : "list"));
  // Desktop: a persisted preference about a column. Phone: a sheet over the
  // content, which starts closed whatever the desktop preference is.
  const [infoPaneOpen, setInfoPaneState] = useState(() => !isMobileNow() && read("info-pane", "on") !== "off");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0].id);
  const [openIds, setOpenIds] = useState<number[]>(selectedId != null ? [selectedId] : []);

  // Integration data plane. Defaults to the seed-derived domain view (so the prototype
  // runs with no backend); if Supabase is configured, live data replaces it on mount.
  const [audit, setAudit] = useState<AuditEntry[]>(seed.audit);
  const [nodeTypes, setNodeTypes] = useState<StepAction[]>(ACTIONS);
  const [liveWorkflows, setConnectedWorkflows] = useState<DomainWorkflow[]>([]);
  const [capabilitySet, setCapabilitySet] = useState<Set<Capability>>(() => new Set(CAPABILITIES));
  const [dataSource, setDataSource] = useState<"live" | "seed">("seed");
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  // Without a backend the domain view *is* the local library, so it has to be
  // derived rather than snapshotted: the library is editable, and a workflow
  // authored a moment ago should appear here as it would through the API.
  const connectedWorkflows = useMemo(
    () => (dataSource === "live" ? liveWorkflows : seedConnectedWorkflows(workflows, members)),
    [dataSource, liveWorkflows, workflows, members],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const [caps, live, palette] = await Promise.all([getCapabilities(), getWorkflows(), getNodeTypes()]);
        if (cancelled) return;
        setCapabilitySet(new Set(caps));
        setConnectedWorkflows(live);
        // An empty catalogue means the table hasn't been seeded; keep the fallback
        // rather than handing the builder a palette with nothing in it.
        if (palette.length > 0) setNodeTypes(palette);
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
  // Narrowed on the way in as well as on the way out: a stored value is only ever
  // as trustworthy as the version of the app that wrote it.
  const [libraryLayout, setLibraryLayoutState] = useState<LibraryLayout>(() => asLayout(read("library-layout", "")));
  const [libraryDensity, setLibraryDensityState] = useState<LibraryDensity>(() =>
    asDensity(read("library-density", "")),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(() => isDark());
  const [role, setRoleState] = useState<Role>(() => read("role", currentUser.role) as Role);
  const [authed, setAuthed] = useState(() => read("authed", "no") === "yes");
  const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];

  const setBackgroundEnabled = (on: boolean) => {
    setBgState(on);
    write("bg-enabled", on ? "on" : "off");
  };
  const setLibraryLayout = (next: LibraryLayout) => {
    setLibraryLayoutState(next);
    write("library-layout", next);
  };
  const setLibraryDensity = (next: LibraryDensity) => {
    setLibraryDensityState(next);
    write("library-density", next);
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

  // The context pane is a column on desktop and a modal sheet on a phone, and a
  // modal must not outlive what opened it: navigating with it open — or dragging
  // a desktop window narrow while it is showing — would land you on a new screen
  // behind a dialog you never opened.
  useEffect(() => {
    if (isMobile) setInfoPaneState(false);
  }, [isMobile, view]);

  /**
   * Swap the whole dataset — a clean install, or the sample estate.
   *
   * This replaces every collection *and* every selection into one, because a
   * selection is an id into a dataset that no longer exists: keeping
   * `selectedWorkflowId` across the swap would leave the detail pane pointed at a
   * workflow that isn't in the library any more, which renders as an empty pane
   * that looks broken rather than as the clean slate it is. Edits made in the old
   * dataset go with it, which is the honest reading of "load different data".
   */
  const setDemoData = (on: boolean) => {
    const next = dataset(on, currentUser);
    setDemoDataState(on);
    write("demo-data", on ? "on" : "off");

    setIssues(next.issues);
    setMembers(next.members);
    setWorkflows(next.workflows);
    setFolders(next.folders);
    setFiles(next.files);
    setRuns(next.runs);
    setRunners(next.runners);
    setSchedules(next.schedules);
    setEventTriggers(next.eventTriggers);
    setCredentials(next.credentials);
    setPackages(next.packages);
    setGlobalValues(next.globalValues);
    setPlatformUsers(next.platformUsers);
    setLicenses(next.licenses);
    setAudit(next.audit);

    setDraft(null);
    setUndoStack(null);
    setSelectedId(openOnDesktop(next.issues[0]?.id ?? null));
    setOpenIds(next.issues[0] && !isMobileNow() ? [next.issues[0].id] : []);
    setSelectedWorkflowId(openOnDesktop(next.workflows[0]?.id ?? null));
    setSelectedRunnerId(openOnDesktop(next.runners[0]?.id ?? null));
    setSelectedFolderId(null);
    setSelectedFileId(null);
    setSelectedRunId(null);
    setPeeking(false);
    setTreeSelectionState(next.workflows[0] && !isMobileNow() ? [{ kind: "workflow", id: next.workflows[0].id }] : []);
    // The stored expansion set names folders from the dataset being left behind.
    persistExpanded(new Set(["vis:public", "vis:private", ...next.folders.map((f) => f.id)]));
  };

  /**
   * Store a profile and update the workspace's own rows for you.
   *
   * The member row is what every avatar and assignee resolves through and the
   * platform-user row is what Administration lists, so a profile that changed only
   * the account menu would leave your old name on every other surface — including
   * the one screen you'd open to check the change took.
   *
   * Both patches are no-ops on the sample estate, which has no `me` row: that is a
   * fictional team, and writing your name into it would be the demo claiming you
   * authored somebody else's workflows.
   */
  const applyProfile = (next: CurrentUser) => {
    setCurrentUser(next);
    writeUser(next);
    setMembers((prev) => prev.map((m) => (m.id === ME_ID ? meAsMember(next) : m)));
    setPlatformUsers((prev) =>
      prev.map((u) => (u.id === ME_PLATFORM_USER_ID ? { ...u, ...meAsPlatformUser(next) } : u)),
    );
  };

  const memberIndex = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

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

  /* --------------------------------------------------------- the library tree */

  // Append one entry to the trail. Append-only by construction — there is no
  // update or delete here, and there should never be one.
  const appendAudit = (entry: { category: AuditCategory; action: string; target: string; detail?: string }) =>
    setAudit((prev) => {
      const seq = `aud_${String(prev.length + 1).padStart(4, "0")}`;
      return [
        ...prev,
        {
          id: seq,
          sourceId: seq,
          platform: "conduit" as const,
          connectorId: "seed",
          actor: currentUser.name,
          at: "just now",
          ...entry,
        },
      ];
    });

  const tree: LibraryTree = { folders, workflows, files };

  /** Apply an edit's result to the three collections, or hand back its refusal.
   *  Nothing is written when an edit is refused, so a rejected rename can't leave
   *  half a move behind. */
  const applyEdit = (
    result: EditResult,
    record: { category: AuditCategory; action: string; target: string; detail?: string },
  ): string | null => {
    if (!result.ok) return result.reason;
    // Snapshot before writing. The edits are pure and return a *new* tree, so the
    // one they were handed is still intact and is the whole of what undo needs.
    setUndoStack({
      label: `${record.action.charAt(0).toUpperCase()}${record.action.slice(1)} ${record.target}`,
      tree,
      selection: { workflow: selectedWorkflowId, folder: selectedFolderId, file: selectedFileId },
    });
    setFolders(result.tree.folders);
    setWorkflows(result.tree.workflows);
    setFiles(result.tree.files);
    appendAudit(record);
    return null;
  };

  /** Write a whole batch at once, snapshotting first so undo takes the batch back
   *  as a unit rather than one node at a time — a bulk delete you can only undo
   *  in pieces is not much of an undo. */
  const applyBulk = (
    next: LibraryTree,
    record: { category: AuditCategory; action: string; target: string; detail?: string },
  ) => {
    setUndoStack({
      label: `${record.action.charAt(0).toUpperCase()}${record.action.slice(1)} ${record.target}`,
      tree,
      selection: { workflow: selectedWorkflowId, folder: selectedFolderId, file: selectedFileId },
    });
    setFolders(next.folders);
    setWorkflows(next.workflows);
    setFiles(next.files);
    appendAudit(record);
  };

  /** The label a node is known by in the trail — read before the edit, since a
   *  rename is precisely the case where the old name is the informative one. */
  const labelOf = (node: LibraryNode): string => {
    if (node.kind === "folder") return folders.find((f) => f.id === node.id)?.name ?? node.id;
    if (node.kind === "workflow") return workflows.find((w) => w.id === node.id)?.name ?? node.id;
    return files.find((f) => f.id === node.id)?.name ?? node.id;
  };

  /** Drop a selection pointing at something that no longer exists. */
  const forgetNode = (node: LibraryNode) => {
    if (node.kind === "workflow" && selectedWorkflowId === node.id) setSelectedWorkflowId(null);
    if (node.kind === "file" && selectedFileId === node.id) setSelectedFileId(null);
    if (node.kind === "folder") {
      // A cascade takes the open workflow or file with it, not just the folder.
      if (selectedFolderId === node.id) setSelectedFolderId(null);
      setSelectedWorkflowId((current) => (current && !workflowSurvives(node, current) ? null : current));
      setSelectedFileId((current) => (current && !fileSurvives(node, current) ? null : current));
    }
  };
  const doomedFolders = (node: LibraryNode) =>
    node.kind === "folder" ? new Set(subtreeIds(folders, node.id)) : new Set<string>();
  const workflowSurvives = (node: LibraryNode, id: string) =>
    !doomedFolders(node).has(workflows.find((w) => w.id === id)?.folderId ?? "");
  const fileSurvives = (node: LibraryNode, id: string) =>
    !doomedFolders(node).has(files.find((f) => f.id === id)?.folderId ?? "");

  const create = (made: CreateResult, record: { action: string; target: string }): { id: string } | { reason: string } => {
    if (!made.ok) return { reason: made.reason };
    setUndoStack({
      label: `Created ${record.target}`,
      tree,
      selection: { workflow: selectedWorkflowId, folder: selectedFolderId, file: selectedFileId },
    });
    setFolders(made.tree.folders);
    setWorkflows(made.tree.workflows);
    setFiles(made.tree.files);
    appendAudit({ category: "lifecycle", ...record });
    return { id: made.id };
  };

  /*
   * Start a run, and keep it up to date as it reports.
   *
   * The run row appears immediately, queued, with the placement rationale already in
   * its log — then the events fill it in live, from whichever engine is executing:
   * this tab, or a runner in the pool posting to `run_events`. One code path either
   * way, because both produce the same protocol events.
   */
  const launchRun = (workflow: Workflow): string => {
    const run = startedRun(workflow, currentUser.name, runs, runners);
    setRuns((prev) => [run, ...prev]);

    // The log is two streams that stay separate: what a runner reported (numbered by
    // its own `sequence`) and what the control plane had to say (placement, a refused
    // trigger). Numbering ours into the runner's series would make our first note and
    // its first event claim one identity, and `orderEvents` de-duplicates on exactly that.
    const received: RunEvent[] = [];
    const notes: ActivityEvent[] = [];
    const redraw = (running: boolean): void => {
      const activity = [...run.activity, ...notes, ...runEventsToActivity(received)];
      setRuns((prev) =>
        prev.map((r) =>
          r.id !== run.id ? r : { ...r, state: running && r.state === "Queued" ? "Running" : r.state, activity },
        ),
      );
    };
    const note = (message: string): void => {
      notes.push(controlPlaneNote(run.id, notes.length + 2, message));
      redraw(false);
    };
    const paint = (event: RunEvent): void => {
      received.push(event);
      // The first event is the run actually starting: until one arrives it is queued,
      // which is the honest state for work nobody has picked up.
      redraw(!isTerminal(event.kind));
    };

    /** Close the run out: its outcome, and how long it took. The workflow's rollups
     *  move with it — `successRate` is left alone, because it is a rollup over runs
     *  the prototype never had, and inventing a new one from a single run would be a
     *  worse number than the one already there. */
    const conclude = (state: Run["state"], ms: number): void => {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, state, duration: durationLabel(ms) } : r)));
      setWorkflows((prev) =>
        prev.map((w) => (w.id === workflow.id ? { ...w, runCount: w.runCount + 1, lastRunAt: "just now" } : w)),
      );
    };

    void startRun({ workflow, runId: run.id, onEvent: paint, onNote: note })
      .then((started) => {
        if (started.result) {
          conclude(started.result.state === "completed" ? "Completed" : "Failed", started.result.elapsedMs);
          return;
        }
        // The pool took it. Watch the log arrive, and close the run out on the
        // terminal event — the same event the control plane finishes the row on.
        const stop = subscribeRunEvents(run.id, (event) => {
          paint(event);
          if (!isTerminal(event.kind)) return;
          const first = Date.parse(received[0]?.at ?? event.at);
          const last = Date.parse(event.at);
          conclude(event.kind === "finished" ? "Completed" : "Failed", Number.isNaN(first) ? 0 : last - first);
          stop();
        });
      })
      .catch((error: unknown) => {
        // Starting a run is the one place a thrown error would otherwise vanish into a
        // promise: the run row would sit at Queued forever with nothing said.
        paint({
          runId: run.id,
          sequence: received.length + 1,
          kind: "failed",
          message: `Run failed to start — ${error instanceof Error ? error.message : String(error)}`,
          at: new Date().toISOString(),
        });
        conclude("Failed", 0);
      });

    return run.id;
  };

  const value: Store = {
    demoData,
    setDemoData,
    issues,
    members,
    workflows,
    folders,
    files,
    runs,
    runners,
    schedules,
    eventTriggers,
    credentials,
    packages,
    globalValues,
    platformUsers,
    licenses,
    roleDefs: seed.roleDefs,
    policies: seed.policies,
    workflowById: (id) => workflows.find((a) => a.id === id),
    runById: (id) => runs.find((r) => r.id === id),
    runnerById: (id) => runners.find((r) => r.id === id),
    runsForWorkflow: (id) => runs.filter((r) => r.workflowId === id),
    draft,
    // New work lands in the private Drafts folder. The signed-in demo account
    // isn't one of the team members, so ownership defaults to the first and is
    // editable in the builder.
    newWorkflow: (folderId) => {
      // Somewhere that still exists, else the private root — a folder id from a
      // stale selection would file the draft nowhere the tree can show it, and on
      // a clean install "Drafts" doesn't exist yet.
      const home =
        (folderId && folders.some((f) => f.id === folderId) && folderId) ||
        (folders.some((f) => f.id === "prv-drafts") ? "prv-drafts" : undefined) ||
        folders.find((f) => f.visibility === "private")?.id ||
        folders[0]?.id ||
        "";
      setDraft(blankDraft(members[0]?.id ?? "", home));
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
      setSelectedFolderId(null);
      setSelectedFileId(null);
      setDraft(null);
      setViewRaw("workflows");
      return id;
    },
    testRunDraft: () => {
      if (!draft) return;
      // Saved first, and the *saved* workflow is what runs: `commitDraft` raises the
      // requirements to the floor its steps impose, and a test run that executed the
      // unsaved draft would be placing work by numbers the library doesn't hold.
      const { workflows: next, id } = commitDraft(workflows, draft, currentUser.name);
      const saved = next.find((a) => a.id === id)!;
      setWorkflows(next);
      launchRun(saved);
      setSelectedWorkflowId(id);
      setSelectedFolderId(null);
      setSelectedFileId(null);
      setDraft(null);
      setViewRaw("activity");
    },
    runWorkflow: (workflowId) => {
      const workflow = workflows.find((w) => w.id === workflowId);
      // A mirrored workflow is executed by its own platform; triggering it from here
      // would need its connector to accept a run, which is not this stage's promise.
      if (!workflow || workflow.platform !== "conduit") return null;
      const id = launchRun(workflow);
      setSelectedWorkflowId(workflowId);
      setViewRaw("activity");
      return id;
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
      // A demoted viewer loses any surface their new tier can't reach. Governance
      // is one destination with one gate now, so this is one check rather than one
      // per screen — and the subpage goes with it: staying on `administration`
      // while bounced to Home would leave the rail's group open on a screen the
      // new tier can't see.
      if (!can(r, "review") && view === "governance") {
        setViewRaw("home");
        setSubview(null);
      }
    },
    allowed: (permission) => can(role, permission),
    audit,
    nodeTypes,
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
      // Every move writes to the trail. Delegation is only defensible if "who
      // approved this, and when" survives the click that did it.
      const moved = workflows.find((w) => w.id === id);
      if (moved && canTransition(role, moved.status, action)) {
        const version = latestVersion(moved.versions)?.version;
        appendAudit({
          category: categoryOfReviewAction(action),
          action: REVIEW_ACTION_VERB[action],
          target: version ? `${moved.name} v${version}` : moved.name,
          detail: note,
        });
      }
    },
    selectedId,
    selected: issues.find((i) => i.id === selectedId) ?? null,
    selectedWorkflowId,
    // The library's detail pane holds one thing: opening a workflow closes the
    // open folder, and opening a folder closes the open workflow. Clearing either
    // (the breadcrumb, a layout switch) leaves the other alone.
    selectWorkflow: (id) => {
      setSelectedWorkflowId(id);
      if (id !== null) {
        setSelectedFolderId(null);
        setSelectedFileId(null);
      }
    },
    selectedFolderId,
    selectFolder: (id) => {
      setSelectedFolderId(id);
      if (id !== null) {
        setSelectedWorkflowId(null);
        setSelectedFileId(null);
      }
    },
    selectedFileId,
    selectFile: (id) => {
      setSelectedFileId(id);
      if (id !== null) {
        setSelectedWorkflowId(null);
        setSelectedFolderId(null);
      }
    },
    renameNode: (node, name) => {
      const was = labelOf(node);
      return applyEdit(renameInTree(tree, node, name), {
        category: "lifecycle",
        action: "renamed",
        target: was,
        detail: `to "${name.trim()}"`,
      });
    },
    moveNode: (node, target) =>
      applyEdit(moveInTree(tree, node, target), {
        category: "lifecycle",
        action: "moved",
        target: labelOf(node),
        detail:
          target.kind === "root"
            ? `to the top of ${target.visibility === "public" ? "Public" : "Private"}`
            : `into ${folders.find((f) => f.id === target.id)?.name ?? target.id}`,
      }),
    deleteNode: (node) => {
      const label = labelOf(node);
      const under = countUnderNode(tree, node);
      const refusal = applyEdit(deleteInTree(tree, node), {
        // A deletion is the one library edit nobody can undo, so it files as
        // governance rather than as routine tidying.
        category: "governance",
        action: "deleted",
        target: label,
        detail:
          node.kind === "folder"
            ? `${under.folders} folder${under.folders === 1 ? "" : "s"}, ${under.workflows} workflow${under.workflows === 1 ? "" : "s"}, ${under.files} file${under.files === 1 ? "" : "s"}`
            : undefined,
      });
      if (refusal === null) forgetNode(node);
      return refusal;
    },
    newFolder: (target) => {
      const name = freeName(tree, target, "New folder");
      return create(createFolder(tree, target, name), { action: "created folder", target: name });
    },
    newFile: (folderId, extension) => {
      const target: MoveTarget = { kind: "folder", id: folderId };
      const name = freeName(tree, target, "untitled", extension);
      return create(createFile(tree, folderId, name, members[0]?.id ?? ""), {
        action: "created file",
        target: name,
      });
    },
    countUnder: (node) => countUnderNode(tree, node),
    treeSelection,
    setTreeSelection: (nodes) => {
      // Choosing what's selected is choosing what the pane answers about, so it
      // ends a peek.
      setPeeking(false);
      setTreeSelectionState(nodes);
    },
    peeking,
    peekNode: (node) => {
      setPeeking(true);
      if (node.kind === "folder") {
        setSelectedFolderId(node.id);
        setSelectedWorkflowId(null);
        setSelectedFileId(null);
      } else if (node.kind === "workflow") {
        setSelectedWorkflowId(node.id);
        setSelectedFolderId(null);
        setSelectedFileId(null);
      } else {
        setSelectedFileId(node.id);
        setSelectedWorkflowId(null);
        setSelectedFolderId(null);
      }
    },
    countUnderAll: (nodes) => countUnderAllNodes(tree, nodes),
    moveNodes: (nodes, target) => {
      const result = moveManyInTree(tree, nodes, target);
      if (result.moved > 0) {
        applyBulk(result.tree, {
          category: "lifecycle",
          action: "moved",
          target: `${result.moved} item${result.moved === 1 ? "" : "s"}`,
          detail:
            target.kind === "root"
              ? `to the top of ${target.visibility === "public" ? "Public" : "Private"}`
              : `into ${folders.find((f) => f.id === target.id)?.name ?? target.id}`,
        });
      }
      return { moved: result.moved, refusals: result.refusals };
    },
    deleteNodes: (nodes) => {
      const under = countUnderAllNodes(tree, nodes);
      const result = deleteManyInTree(tree, nodes);
      if (result.moved > 0) {
        applyBulk(result.tree, {
          category: "governance",
          action: "deleted",
          target: `${result.moved} item${result.moved === 1 ? "" : "s"}`,
          detail: `${under.folders} folder${under.folders === 1 ? "" : "s"}, ${under.workflows} workflow${under.workflows === 1 ? "" : "s"}, ${under.files} file${under.files === 1 ? "" : "s"}`,
        });
        for (const node of nodes) forgetNode(node);
        setTreeSelectionState([]);
      }
      return { moved: result.moved, refusals: result.refusals };
    },
    isExpanded: (id) => expanded.has(id),
    toggleExpanded: (id) => {
      const next = new Set(expanded);
      next.has(id) ? next.delete(id) : next.add(id);
      persistExpanded(next);
    },
    expand: (id) => {
      if (expanded.has(id)) return;
      persistExpanded(new Set(expanded).add(id));
    },
    undoable: undoStack ? { label: undoStack.label } : null,
    undo: () => {
      if (!undoStack) return;
      setFolders(undoStack.tree.folders);
      setWorkflows(undoStack.tree.workflows);
      setFiles(undoStack.tree.files);
      setSelectedWorkflowId(undoStack.selection.workflow);
      setSelectedFolderId(undoStack.selection.folder);
      setSelectedFileId(undoStack.selection.file);
      // The trail is append-only: taking an edit back is a new entry, never the
      // removal of the one it reverses.
      //
      // Only the label's leading verb is lowercased, so it joins "undid …" as a
      // sentence without flattening what follows. `toLowerCase()` on the whole
      // label filed "undid moved payment reconciliation" — a governance record
      // that renames the very workflow it is accounting for.
      appendAudit({
        category: "lifecycle",
        action: "undid",
        target: undoStack.label.charAt(0).toLowerCase() + undoStack.label.slice(1),
      });
      setUndoStack(null);
    },
    selectedRunnerId,
    selectRunner: setSelectedRunnerId,
    selectedRunId,
    selectRun: setSelectedRunId,
    controls: (s) => controlState[s] ?? EMPTY_WORKSPACE,
    setControlsQuery: (s, query) => patchControls(s, { query }),
    setControlsFilter: (s, filterId, value, op) =>
      setControlState((prev) => {
        const current = prev[s] ?? EMPTY_WORKSPACE;
        const filters = { ...current.filters };
        if (value === null) delete filters[filterId];
        // Keep the operator when only the value changes, and vice versa.
        else filters[filterId] = { op: op ?? filters[filterId]?.op ?? "is", value };
        return { ...prev, [s]: { ...current, filters } };
      }),
    setControlsSort: (s, sort, dir) => patchControls(s, { sort, dir: dir ?? "" }),
    clearControls: (s) => patchControls(s, { query: "", filters: {}, sort: "", dir: "" }),
    sectionTab: (s) => sectionTabs[s] ?? "",
    setSectionTab: (s, tab) => setSectionTabs((prev) => ({ ...prev, [s]: tab })),
    view,
    subview,
    section,
    sidebarExpanded,
    layout,
    setLayout: (l) => {
      setLayoutState(l);
      write("layout", l);
    },
    viewMode: (s) => {
      const modes = VIEW_MODES[s];
      if (!modes || modes.length === 0) return "list";
      // A phone has room for one presentation, and it is the first one: every
      // alternate here (board, grid, timeline, diagram) is multi-column by
      // definition. The preference isn't cleared, just not honoured — it comes
      // back the moment there is width for it.
      if (isMobile) return modes[0].id;
      return layout === "list" ? modes[0].id : modes[1]?.id ?? modes[0].id;
    },
    infoPaneOpen,
    // Only the desktop pane's state is a preference worth keeping. Persisting the
    // phone's sheet would carry "open" back to the desktop — and back to the next
    // phone visit, where it would reopen over whatever you navigated to.
    setInfoPaneOpen: (on) => {
      setInfoPaneState(on);
      if (!isMobile) write("info-pane", on ? "on" : "off");
    },
    toggleInfoPane: () =>
      setInfoPaneState((prev) => {
        const next = !prev;
        if (!isMobile) write("info-pane", next ? "on" : "off");
        return next;
      }),
    contextLabel: CONTEXT_LABEL[section] ?? "Details",
    isMobile,
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
    libraryLayout,
    setLibraryLayout,
    libraryDensity,
    setLibraryDensity,
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
    // An email is the only identity this prototype is ever handed, so it seeds the
    // profile. Signing in again with a *different* address adopts it — otherwise
    // the first person to open the app would own the workspace's name for good.
    // A provider button passes nothing and keeps whatever is already stored.
    signIn: (email) => {
      if (email && email.trim() && email.trim() !== currentUser.email) {
        applyProfile(userFromEmail(email, currentUser.role));
      }
      setAuthed(true);
      write("authed", "yes");
    },
    signOut: () => {
      setAuthed(false);
      write("authed", "no");
    },
    currentUser,
    updateProfile: (patch) => {
      const name = patch.name ?? currentUser.name;
      applyProfile({
        ...currentUser,
        ...patch,
        name,
        initials: initialsOf(name),
      });
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
