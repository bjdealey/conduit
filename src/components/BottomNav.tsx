import { useEffect, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { useStore, type View } from "../store";
import { emailLine } from "../data/user";
import { MOBILE_BAR, MOBILE_BAR_SLOTS, defaultSubpage, navItems, type NavItemDef, type SubPage } from "../data/nav";
import { navIcons } from "../data/navIcons";
import { splitDestinations } from "../lib/responsive";
import { CountBadge } from "./CountBadge";
import { Sheet } from "./Sheet";
import { ThemeToggle } from "./ThemeToggle";

/* =============================================================================
   The phone's primary navigation
   -----------------------------------------------------------------------------
   A bottom bar with an overflow sheet, replacing the sidebar rail on phone-sized
   viewports. The rail is a good desktop control and a bad phone one: it costs
   56px of a 390px screen permanently, and its destinations sit at the top of the
   screen, furthest from the thumb.

   Which destinations get a slot is declared in `data/nav` (`MOBILE_BAR`) and
   applied *after* role and capability gating, so the bar is built from the same
   filtered list the sidebar is — a destination the current tier can't reach never
   takes a slot, and the overflow picks up whatever didn't fit.
   ============================================================================= */

const barIcons = navIcons(22);
const sheetIcons = navIcons(20);

/** One bar slot. Icon over label, the whole thing a tap target; the active
 *  destination is filled rather than merely tinted, because a colour difference
 *  alone is hard to spot at the bottom edge of a screen held at an angle. */
function BarItem({
  label,
  icon,
  active,
  badge,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className="bottom-nav-item pressable focusable"
      data-active={active}
    >
      <span className="bottom-nav-glyph">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="bottom-nav-badge">
            <CountBadge count={badge} variant="corner" />
          </span>
        )}
      </span>
      <span className="bottom-nav-label">{label}</span>
    </button>
  );
}

/** A destination inside the "More" sheet: a full-width row, sized for a thumb. */
function SheetRow({
  item,
  active,
  badge,
  onSelect,
  onSelectSub,
  activeSub,
}: {
  item: NavItemDef;
  active: boolean;
  badge?: number;
  onSelect: () => void;
  onSelectSub?: (sub: SubPage) => void;
  /** The open subpage when this destination is the one showing, else null. */
  activeSub?: string | null;
}) {
  const subpages = item.subpages ?? [];
  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active && subpages.length === 0 ? "page" : undefined}
        className="sheet-row focusable pressable"
        data-active={active}
      >
        <span className="flex shrink-0 items-center justify-center text-tertiary-foreground">
          {sheetIcons[item.id]}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-body-base text-primary-foreground">
          {item.label}
        </span>
        {badge !== undefined && badge > 0 && <CountBadge count={badge} variant="inline" />}
      </button>
      {subpages.map((sub) => (
        <button
          key={sub.id}
          type="button"
          onClick={() => onSelectSub?.(sub)}
          aria-current={activeSub === sub.id ? "page" : undefined}
          className="sheet-row sheet-row-sub focusable pressable"
          data-active={activeSub === sub.id}
        >
          {/* The parent's glyph carries the group; indentation and a lighter
              weight are what say "inside it" without a second icon vocabulary. */}
          <span className="flex shrink-0 items-center justify-center" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left text-body-base text-secondary-foreground">
            {sub.label}
          </span>
        </button>
      ))}
    </>
  );
}

/**
 * The bottom bar. Rendered only on phone-sized viewports (see `App`), where it
 * is the *only* primary navigation — the sidebar isn't mounted beside it, so
 * there is one nav landmark on screen, not two.
 */
export function BottomNav() {
  const {
    view,
    subview,
    setView,
    openSubview,
    role,
    hasCapability,
    badgesEnabled,
    issues,
    workflows,
    runners,
    workspace,
    openSearch,
    signOut,
    currentUser,
  } = useStore();
  const [moreOpen, setMoreOpen] = useState(false);

  // The sheet is a navigation surface, so arriving somewhere closes it.
  useEffect(() => setMoreOpen(false), [view]);

  // Same gating as the rail: a destination the tier can't reach, or whose
  // capability no connector declares, isn't a destination.
  const visible = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(role)) && (!item.capability || hasCapability(item.capability)),
  );
  const { bar, overflow } = splitDestinations(visible, MOBILE_BAR, MOBILE_BAR_SLOTS);

  // `setView` clears the subview, which would leave a destination that has
  // subpages rendering whichever one its router falls back to while the sheet
  // shows none of them as current. Opening the first one explicitly keeps the
  // two in step.
  const go = (item: NavItemDef) => {
    const sub = defaultSubpage(item.id);
    if (sub) openSubview(item.id, sub);
    else setView(item.id);
  };

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

  // The builder and Settings are full-screen modes, not bar destinations, but
  // you can be *in* one — so "More" carries the active state rather than letting
  // the bar claim nothing is open.
  const inOverflow = overflow.some((item) => item.id === view) || view === "builder";

  return (
    <>
      <nav aria-label="Primary" className="bottom-nav">
        {bar.map((item) => (
          <BarItem
            key={item.id}
            label={item.label}
            icon={barIcons[item.id]}
            active={view === item.id}
            badge={badgeFor(item.id)}
            onSelect={() => go(item)}
          />
        ))}
        <BarItem
          label="More"
          icon={<MoreHorizontal size={22} strokeWidth={1.7} />}
          active={inOverflow || moreOpen}
          onSelect={() => setMoreOpen(true)}
        />
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={workspace.name}>
        <div className="flex flex-col gap-1 px-2 pb-2">
          {/* Universal search lives in the sidebar on desktop; the phone has no
              rail to put it in, and it is the fastest way to anywhere. */}
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              openSearch();
            }}
            className="sheet-row focusable pressable"
          >
            <span className="flex shrink-0 items-center justify-center text-tertiary-foreground">
              <Search size={20} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-body-base text-primary-foreground">
              Search
            </span>
          </button>

          {overflow.map((item) => (
            <SheetRow
              key={item.id}
              item={item}
              active={view === item.id}
              badge={badgeFor(item.id)}
              onSelect={() => go(item)}
              // A destination's subpages are rows in their own right here. The
              // rail expands a group in place; a sheet has no equivalent, and
              // without these Governance's Audit and Administration would have no
              // way in on a phone at all.
              onSelectSub={(sub) => openSubview(item.id, sub.id)}
              activeSub={view === item.id ? subview ?? defaultSubpage(item.id) : null}
            />
          ))}
        </div>

        {/* Account row: who you are, the theme switch, and the way out. The
            desktop rail's account popover would be a menu inside a dialog. */}
        <div className="sheet-footer">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md font-medium"
            style={{ background: "var(--gray-4)", color: "var(--gray-11)", fontSize: "0.78rem" }}
          >
            {currentUser.initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-body-sm font-medium text-primary-foreground">
              {currentUser.name}
            </span>
            <span className="truncate text-tertiary-foreground" style={{ fontSize: "0.72rem" }}>
              {emailLine(currentUser)}
            </span>
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            className="pressable focusable rounded-lg border-border-default border-[0.5px] px-3 py-2 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            Log out
          </button>
        </div>
      </Sheet>
    </>
  );
}
