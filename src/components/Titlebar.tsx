import { MoreHorizontal, PanelRight } from "lucide-react";
import { useStore, type View } from "../store";
import { navItems } from "../data/nav";
import { endUsers } from "../data/users";
import { VIEW_MODES, CONTEXT_LABEL } from "../data/viewLayout";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { SidebarToggle } from "./SidebarToggle";
import { Avatar } from "./Avatar";

/** Generic segmented presentation switcher, driven by `VIEW_MODES`. Shown for any
 *  view that declares more than one mode (inbox board/list, users list/grid, …).
 *  Switching to a non-list mode clears the open item so the board/grid shows (the
 *  detail returns only when you click into an item), matching the inbox. */
function ViewModeSwitcher({ view }: { view: View }) {
  const { viewMode, setViewMode, select, selectUser, selectAutomation } = useStore();
  const modes = VIEW_MODES[view];
  if (!modes || modes.length < 2) return null;
  const active = viewMode(view);
  const clearSelection = () => {
    if (view === "inbox") select(null);
    else if (view === "users") selectUser(null);
    else if (view === "automations") selectAutomation(null);
  };
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-component p-0.5">
      {modes.map((m) => {
        const on = active === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setViewMode(view, m.id);
              if (m.id !== "list") clearSelection();
            }}
            aria-pressed={on}
            className="pressable focusable flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm font-medium transition-colors"
            style={{
              background: on ? "var(--color-page)" : "transparent",
              color: on ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
              boxShadow: on ? "0 0 0 0.5px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}
    </div>
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
  activity: "Activity",
  automations: "Automations",
  manage: "Manage",
  users: "Users",
  administration: "Administration",
  surfaces: "Surfaces",
  environments: "Environments",
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
    automations,
    setView,
    openSubview,
    members,
  } = useStore();

  const openUser = selectedUserId ? endUsers.find((u) => u.id === selectedUserId) ?? null : null;
  const openAutomation = selectedAutomationId
    ? automations.find((a) => a.id === selectedAutomationId) ?? null
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
  } else if (view === "activity") {
    hasContext = true;
    items = [{ label: "Activity" }];
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
  const showSurfaceActions = view === "surfaces";

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-border-default border-b-[0.5px] px-4"
      style={{ height: 56 }}
    >
      <SidebarToggle />
      <Breadcrumb items={items} />

      <div className="ml-auto flex items-center gap-2">
        {showSwitcher && <ViewModeSwitcher view={view} />}

        {showSurfaceActions && (
          <button
            type="button"
            onClick={() => setView("inbox")}
            className="pressable focusable inline-flex items-center gap-2 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover"
          >
            View all problems
            <kbd className="rounded bg-component px-1 font-departure-mono text-[0.65rem] text-tertiary-foreground">P</kbd>
          </button>
        )}

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

        {showSurfaceActions && (
          <button
            type="button"
            aria-label="Surface options"
            className="pressable focusable flex size-7 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </header>
  );
}
