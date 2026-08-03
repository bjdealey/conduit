import { PanelRight } from "lucide-react";
import { useStore, type View } from "../store";
import { navItems } from "../data/nav";
import { endUsers } from "../data/users";
import { runners } from "../data/runners";
import { VIEW_MODES, CONTEXT_LABEL } from "../data/viewLayout";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { SidebarToggle } from "./SidebarToggle";
import { SegmentedControl } from "./SegmentedControl";
import { Avatar } from "./Avatar";

/** Generic segmented presentation switcher, driven by `VIEW_MODES`. Shown for any
 *  view that declares more than one mode (inbox board/list, users list/grid, …).
 *  Switching to a non-list mode clears the open item so the board/grid shows (the
 *  detail returns only when you click into an item), matching the inbox. */
function ViewModeSwitcher({ view }: { view: View }) {
  const { layout, setLayout, select, selectUser, selectAutomation, selectRunner, selectRun } = useStore();
  const modes = VIEW_MODES[view];
  if (!modes || modes.length < 2) return null;
  // Switching to the alternate layout clears every page's open item, so each page
  // lands on its board/grid/timeline — not a stale detail — as you move between them.
  const clearAllSelections = () => {
    select(null);
    selectUser(null);
    selectAutomation(null);
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
  builder: "Automation builder",
  activity: "Activity",
  automations: "Automations",
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
    selected,
    select,
    selectedUserId,
    selectUser,
    selectedAutomationId,
    selectAutomation,
    selectedRunnerId,
    selectRunner,
    selectedRunId,
    selectRun,
    runById,
    draft,
    closeBuilder,
    viewMode,
    automations,
    setView,
    openSubview,
    members,
  } = useStore();

  const openUser = selectedUserId ? endUsers.find((u) => u.id === selectedUserId) ?? null : null;
  const openAutomation = selectedAutomationId
    ? automations.find((a) => a.id === selectedAutomationId) ?? null
    : null;
  const openRunner = selectedRunnerId ? runners.find((r) => r.id === selectedRunnerId) ?? null : null;
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
  } else if (view === "automations") {
    hasContext = !!openAutomation;
    items = openAutomation
      ? [{ label: "Automations", onClick: () => selectAutomation(null) }, { label: openAutomation.name }]
      : [{ label: "Automations" }];
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
      { label: "Automations", onClick: closeBuilder },
      { label: draft?.isNew ? "New automation" : draft?.name || "Untitled automation" },
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
