import { PanelRight } from "lucide-react";
import { useStore, type View } from "../store";
import { navItems } from "../data/nav";
import { endUsers } from "../data/users";
import { runners } from "../data/runners";
import { VIEW_MODES, CONTEXT_LABEL } from "../data/viewLayout";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { folderTrail } from "../lib/folders";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { Chip } from "./Chip";
import { READINESS_META, readinessOfView } from "../data/readiness";
import { SidebarToggle } from "./SidebarToggle";
import { SegmentedControl } from "./SegmentedControl";
import { Avatar } from "./Avatar";

/** Generic segmented presentation switcher, driven by `VIEW_MODES`. Shown for any
 *  view that declares more than one mode (inbox board/list, users list/grid, …).
 *  Switching to a non-list mode clears the open item so the board/grid shows (the
 *  detail returns only when you click into an item), matching the inbox. */
function ViewModeSwitcher({ view }: { view: View }) {
  const { layout, setLayout, select, selectUser, selectWorkflow, selectFolder, selectFile, selectRunner, selectRun } =
    useStore();
  const modes = VIEW_MODES[view];
  if (!modes || modes.length < 2) return null;
  // Switching to the alternate layout clears every page's open item, so each page
  // lands on its board/grid/timeline — not a stale detail — as you move between them.
  const clearAllSelections = () => {
    select(null);
    selectUser(null);
    selectWorkflow(null);
    selectFolder(null);
    selectFile(null);
    selectRunner(null);
    selectRun(null);
  };
  // First mode is always "list"; the second is the page's alternate. The selected
  // segment tracks the global layout, so it persists across pages (only the
  // alternate's label changes: Board vs Grid).
  const value = layout === "list" ? modes[0].id : modes[1].id;
  return (
    <SegmentedControl
      variant="solid"
      ariaLabel="View layout"
      segments={modes.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
      value={value}
      onChange={(id) => {
        const next = id === modes[0].id ? "list" : "alt";
        setLayout(next);
        if (next === "alt") clearAllSelections();
      }}
    />
  );
}

/** Show/hide the right-hand context pane. Consistent across every view that has
 *  one; the label reflects what that view's pane holds. */
function InfoPaneToggle({ label }: { label: string }) {
  const { infoPaneOpen, toggleInfoPane } = useStore();
  return (
    <button
      type="button"
      onClick={toggleInfoPane}
      aria-pressed={infoPaneOpen}
      title={infoPaneOpen ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      className="pressable focusable flex size-7 items-center justify-center rounded-md transition-colors hover:bg-transparent-hover"
      style={{
        background: infoPaneOpen ? "var(--color-transparent-hover)" : "transparent",
        color: infoPaneOpen ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
      }}
    >
      <PanelRight size={16} strokeWidth={1.8} />
    </button>
  );
}

const VIEW_LABEL: Record<Exclude<View, "inbox">, string> = {
  home: "Home",
  review: "Review",
  audit: "Audit",
  builder: "Workflow builder",
  activity: "Activity",
  workflows: "Workflows",
  manage: "Manage",
  users: "Users",
  administration: "Administration",
  surfaces: "Surfaces",
  runners: "Runners",
  settings: "Settings",
};

/** The application titlebar: sidebar toggle + a consistent breadcrumb trail for
 *  the current view/selection, plus a shared control cluster (view-mode switch,
 *  info-pane toggle, and contextual actions) pinned to the right. */
export function Titlebar() {
  const {
    view,
    subview,
    dataSource,
    selected,
    select,
    selectedUserId,
    selectUser,
    selectedWorkflowId,
    selectWorkflow,
    selectedFolderId,
    selectFolder,
    selectedFileId,
    selectFile,
    folders,
    files,
    selectedRunnerId,
    selectRunner,
    selectedRunId,
    selectRun,
    runById,
    draft,
    closeBuilder,
    viewMode,
    workflows,
    setView,
    openSubview,
    members,
  } = useStore();

  const openUser = selectedUserId ? endUsers.find((u) => u.id === selectedUserId) ?? null : null;
  const openWorkflow = selectedWorkflowId
    ? workflows.find((a) => a.id === selectedWorkflowId) ?? null
    : null;
  const openRunner = selectedRunnerId ? runners.find((r) => r.id === selectedRunnerId) ?? null : null;
  // A folder's trail is its ancestry, so the breadcrumb walks back up the library
  // tree the same way the tree walks down it. Whatever is open gets that trail —
  // a workflow and a file are in the tree too, and "Workflows › Bulk invoice
  // export" told you nothing about where it lives.
  const openFile = selectedFileId ? files.find((f) => f.id === selectedFileId) ?? null : null;
  const folderCrumbs = folderTrail(
    folders,
    selectedFolderId ?? openFile?.folderId ?? openWorkflow?.folderId ?? "",
  );
  // Only the Activity timeline opens a run full-pane; the list layout expands runs
  // in place, so a stale selection never leaks into its breadcrumb.
  const openRun =
    view === "activity" && viewMode("activity") === "timeline" && selectedRunId
      ? runById(selectedRunId) ?? null
      : null;

  let items: Crumb[];
  // Whether the current view is showing a right-hand context pane the info toggle
  // can act on — mirrors each view's render conditions so the control is never dead.
  let hasContext = false;
  if (view === "inbox") {
    hasContext = !!selected;
    items = selected
      ? [{ label: "Inbox", onClick: () => select(null) }, { label: selected.title }]
      : [{ label: "Inbox" }];
  } else if (view === "users") {
    hasContext = !!openUser;
    items = openUser
      ? [{ label: "Users", onClick: () => selectUser(null) }, { label: openUser.name }]
      : [{ label: "Users" }];
  } else if (view === "workflows") {
    hasContext = !!openWorkflow || !!openFile || folderCrumbs.length > 0;
    // Every ancestor is a crumb you can climb to; the Breadcrumb renders the last
    // one inert, so whatever is open is the only dead label.
    const trail = folderCrumbs.map((f) => ({ label: f.name, onClick: () => selectFolder(f.id) }));
    items = openWorkflow
      ? [{ label: "Workflows", onClick: () => selectWorkflow(null) }, ...trail, { label: openWorkflow.name }]
      : openFile
        ? [{ label: "Workflows", onClick: () => selectFile(null) }, ...trail, { label: openFile.name }]
        : trail.length > 0
          ? [{ label: "Workflows", onClick: () => selectFolder(null) }, ...trail]
          : [{ label: "Workflows" }];
  } else if (view === "settings") {
    const pageId = subview ?? DEFAULT_SETTINGS_PAGE;
    const page = SETTINGS_PAGES.find((p) => p.id === pageId);
    items = [
      { label: "Settings", onClick: () => openSubview("settings", DEFAULT_SETTINGS_PAGE) },
      { label: page?.label ?? "Settings" },
    ];
  } else if (view === "surfaces") {
    // The Surfaces section always opens on the surface "Dashboard".
    hasContext = true;
    items = [{ label: "Surfaces", onClick: () => setView("surfaces") }, { label: "Dashboard" }];
  } else if (view === "builder") {
    // The builder's trail leads back to the library; its context pane is the
    // step configuration, so the info toggle acts on that.
    hasContext = true;
    items = [
      { label: "Workflows", onClick: closeBuilder },
      { label: draft?.isNew ? "New workflow" : draft?.name || "Untitled workflow" },
    ];
  } else if (view === "activity") {
    hasContext = true;
    items = openRun
      ? [{ label: "Activity", onClick: () => selectRun(null) }, { label: openRun.id }]
      : [{ label: "Activity" }];
  } else if (view === "runners") {
    hasContext = !!openRunner;
    items = openRunner
      ? [{ label: "Runners", onClick: () => selectRunner(null) }, { label: openRunner.name }]
      : [{ label: "Runners" }];
  } else if (subview) {
    const sub = navItems.find((n) => n.id === view)?.subpages?.find((s) => s.id === subview);
    items = [
      { label: VIEW_LABEL[view], onClick: () => setView(view) },
      { label: sub?.label ?? subview },
    ];
  } else {
    items = [{ label: VIEW_LABEL[view] }];
  }

  const readiness = readinessOfView(view, dataSource);
  const showSwitcher = (VIEW_MODES[view]?.length ?? 0) > 1;
  const showInfoToggle = hasContext && !!CONTEXT_LABEL[view];
  const showSubscribers = view === "inbox" && !!selected;

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-border-default border-b-[0.5px] px-4"
      style={{ height: 56 }}
    >
      <SidebarToggle />
      <Breadcrumb items={items} />
      {/* What this screen actually is. The vision names scheduling, credentials and
          multi-user auth as roadmap, and the app draws all three convincingly — so
          each surface says so rather than letting a complete-looking screen imply a
          promise nobody made. */}
      {readiness !== "prototype" && (
        <span title={READINESS_META[readiness].blurb} className="inline-flex">
          <Chip tone={READINESS_META[readiness].tone} dot={false}>
            {READINESS_META[readiness].label}
          </Chip>
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {showSwitcher && <ViewModeSwitcher view={view} />}

        {showSubscribers && (
          <div className="flex items-center gap-3 pl-1">
            <div className="flex items-center -space-x-1.5">
              {members.map((m) => (
                <div key={m.id} className="rounded-md p-[1.5px]" style={{ background: "var(--color-page)" }}>
                  <Avatar member={m} size={20} />
                </div>
              ))}
            </div>
            <span className="rounded-full bg-component px-2.5 py-1 text-body-sm text-secondary-foreground">
              Subscribed
            </span>
          </div>
        )}

        {showInfoToggle && <InfoPaneToggle label={CONTEXT_LABEL[view] ?? "Details"} />}
      </div>
    </header>
  );
}
