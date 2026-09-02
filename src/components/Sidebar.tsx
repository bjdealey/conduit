import { useStore, type View } from "../store";
import { navItems } from "../data/nav";
import { navIcons } from "../data/navIcons";
import { NavGroup } from "./NavGroup";
import { OpenItem } from "./OpenItem";
import { UserMenu } from "./UserMenu";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { ThemeToggle } from "./ThemeToggle";
import { SidebarSearch } from "./SidebarSearch";
import { SettingsBack, SettingsNav } from "./SettingsRail";

// Shared with the phone's bottom bar (`data/navIcons`), so a destination can't
// end up with two different glyphs on the two shells.
const icons = navIcons(20);

/** Left navigation rail. Items switch the main view. The expand/collapse control
 *  lives in the main content header (SidebarToggle) and drives `sidebarExpanded`
 *  in the store, which sets this rail's width and label visibility. */
export function Sidebar() {
  const { sidebarExpanded: expanded, view, openIds, issues, workflows, runners, badgesEnabled, role, hasCapability } =
    useStore();
  const inSettings = view === "settings";

  // Gating: hide nav items whose `roles` exclude the current role, or whose declared
  // `capability` isn't enabled by any connector. (Seed mode enables all capabilities, so
  // the default prototype shows everything.)
  const visibleNav = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(role)) && (!item.capability || hasCapability(item.capability)),
  );

  const openIssues = openIds
    .map((id) => issues.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  // Data-driven counts shown as rail badges (undefined = no badge). When the
  // user turns badges off in Settings, no item gets a count.
  const badgeFor = (id: View): number | undefined => {
    if (!badgesEnabled) return undefined;
    switch (id) {
      case "activity":
        return issues.filter((i) => i.status === "Under Investigation" || i.status === "Active").length;
      case "workflows":
        return workflows.length;
      case "runners":
        return runners.length;
      default:
        return undefined;
    }
  };

  return (
    <nav
      aria-label="Primary"
      data-expanded={expanded}
      className="relative flex shrink-0 flex-col p-2 transition-[width] duration-200 ease-out"
      style={{ width: expanded ? 216 : 56, zIndex: 30 }}
    >
      {/* Top slot: workspace switcher normally, a Back control in Settings mode.
          Keyed on the mode so the swap remounts and `.rail-swap` runs — see the
          note on the nav region below for why the rail crossfades at all. */}
      <div key={inSettings ? "settings-top" : "main-top"} className="rail-swap">
        {inSettings ? <SettingsBack expanded={expanded} /> : <WorkspaceMenu expanded={expanded} />}
      </div>

      {/* Universal search (opens the command palette) — issue-specific, so hidden
          while in Settings. */}
      {!inSettings && (
        <div className="mb-1">
          <SidebarSearch expanded={expanded} />
        </div>
      )}

      {/* Scrollable middle region: primary nav (with optional subpages) plus the
          pinned open pages. When expanded it scrolls independently so a long list
          never pushes the account row off-screen. When collapsed it must NOT clip,
          or the hover tooltips/flyouts (which pop out to the right) get cut off —
          and collapsed items are small enough that scrolling is rarely needed. */}
      <div
        className={
          // The negative margin + matching padding bleed the scroll box past the
          // rail edges so an active item's soft shadow isn't clipped left/right
          // when the list scrolls (expanded). Collapsed stays overflow-visible so
          // the hover tooltips/flyouts can escape.
          "scrollbar-none -mx-1.5 flex min-h-0 flex-1 flex-col px-1.5 " +
          (expanded ? "overflow-y-auto" : "overflow-visible")
        }
      >
        {/* Entering Settings replaces this whole region — twelve destinations plus
            the pinned open pages become seven settings pages. Everywhere else the
            rail is the fixed frame the content moves inside, so this is the one
            navigation that swaps the frame itself, and it crossfades rather than
            cutting. Keyed on the mode so React remounts and the animation runs.
            The wrapper is layout-neutral (a plain flex column) and unpositioned,
            so it doesn't become a containing block for the collapsed rail's
            tooltips/flyouts, which escape their row to `left: 100%`. */}
        <div key={inSettings ? "settings-nav" : "main-nav"} className="rail-swap flex flex-col">
          {inSettings ? (
            <SettingsNav expanded={expanded} />
          ) : (
            <>
              {/* Primary nav items (with optional subpages) */}
              <div className="flex flex-col items-center gap-1">
                {visibleNav.map((item) => (
                  <NavGroup
                    key={item.id}
                    item={item}
                    icon={icons[item.id]}
                    badge={badgeFor(item.id)}
                    expanded={expanded}
                  />
                ))}
              </div>

              {/* Open pages: issues opened this session, pinned below the divider. They
                  persist here as you navigate elsewhere. */}
              {openIssues.length > 0 && (
                <div className="mx-auto my-2 h-px w-6 shrink-0" style={{ background: "var(--color-border-default)" }} />
              )}
              <div className="flex flex-col items-center gap-1">
                {openIssues.map((issue) => (
                  <OpenItem key={issue.id} issue={issue} expanded={expanded} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Account menu + theme toggle pinned to the bottom */}
      <div className={"mt-1 flex gap-1 " + (expanded ? "items-center" : "flex-col items-center")}>
        <div className={expanded ? "min-w-0 flex-1" : "w-full"}>
          <UserMenu expanded={expanded} />
        </div>
        <ThemeToggle />
      </div>
    </nav>
  );
}
