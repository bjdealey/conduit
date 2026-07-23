import { Columns3, Inbox, List, MoreHorizontal } from "lucide-react";
import { useStore, type View } from "../store";
import { navItems } from "../data/nav";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { SidebarToggle } from "./SidebarToggle";
import { Avatar } from "./Avatar";

const InboxIcon = <Inbox size={17} strokeWidth={1.7} />;

/** Segmented Board / List switch for the inbox. */
function LayoutToggle() {
  const { inboxLayout, setInboxLayout } = useStore();
  const options = [
    { id: "board", label: "Board", icon: <Columns3 size={14} strokeWidth={1.8} /> },
    { id: "list", label: "List", icon: <List size={14} strokeWidth={1.8} /> },
  ] as const;
  return (
    <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-component p-0.5">
      {options.map((o) => {
        const active = inboxLayout === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setInboxLayout(o.id)}
            aria-pressed={active}
            className="pressable focusable flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm font-medium transition-colors"
            style={{
              background: active ? "var(--color-page)" : "transparent",
              color: active ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
              boxShadow: active ? "0 0 0 0.5px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const VIEW_LABEL: Record<Exclude<View, "inbox">, string> = {
  activity: "Activity",
  users: "Users",
  surfaces: "Surfaces",
  environments: "Environments",
  settings: "Settings",
};

/** The application titlebar: sidebar toggle + a consistent breadcrumb trail for
 *  the current view/selection, plus contextual actions (issue subscribers). */
export function Titlebar() {
  const { view, subview, selected, select, setView, openSubview, members } = useStore();

  let items: Crumb[];
  if (view === "inbox") {
    if (selected) {
      items = [{ label: "Inbox", icon: InboxIcon, onClick: () => select(null) }, { label: selected.title }];
    } else {
      items = [{ label: "Inbox" }];
    }
  } else if (view === "settings") {
    const pageId = subview ?? DEFAULT_SETTINGS_PAGE;
    const page = SETTINGS_PAGES.find((p) => p.id === pageId);
    items = [
      { label: "Settings", onClick: () => openSubview("settings", DEFAULT_SETTINGS_PAGE) },
      { label: page?.label ?? "Settings" },
    ];
  } else if (view === "surfaces") {
    // The Surfaces section always opens on the surface "Dashboard".
    items = [{ label: "Surfaces", onClick: () => setView("surfaces") }, { label: "Dashboard" }];
  } else if (subview) {
    const sub = navItems.find((n) => n.id === view)?.subpages?.find((s) => s.id === subview);
    items = [
      { label: VIEW_LABEL[view], onClick: () => setView(view) },
      { label: sub?.label ?? subview },
    ];
  } else {
    items = [{ label: VIEW_LABEL[view] }];
  }

  const showSubscribers = view === "inbox" && !!selected;
  const showLayoutToggle = view === "inbox" && !selected;
  const showSurfaceActions = view === "surfaces";

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-border-default border-b-[0.5px] px-4"
      style={{ height: 56 }}
    >
      <SidebarToggle />
      <Breadcrumb items={items} />

      {showLayoutToggle && <LayoutToggle />}

      {showSurfaceActions && (
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("inbox")}
            className="pressable focusable inline-flex items-center gap-2 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover"
          >
            View all problems
            <kbd className="rounded bg-component px-1 font-departure-mono text-[0.65rem] text-tertiary-foreground">P</kbd>
          </button>
          <button
            type="button"
            aria-label="Surface options"
            className="pressable focusable flex size-7 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}

      {showSubscribers && (
        <div className="ml-auto flex items-center gap-3 pl-3">
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
    </header>
  );
}
