import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Hash } from "lucide-react";
import { useStore } from "../store";
import { defaultSubpage, type NavItemDef } from "../data/nav";
import { ACTIVE_ITEM_STYLE } from "../lib/railStyles";
import { RailTooltip } from "./RailTooltip";
import { RailFlyout } from "./RailFlyout";
import { CountBadge } from "./CountBadge";

const HashIcon = <Hash size={14} strokeWidth={1.7} />;

/** A sidebar page, optionally with subpages. Expanded: a chevron toggles an
 *  indented subpage list. Collapsed: hovering shows a subpage flyout if it has
 *  subpages, otherwise the usual name tooltip. */
export function NavGroup({
  item,
  icon,
  badge,
  expanded,
}: {
  item: NavItemDef;
  icon: ReactNode;
  badge?: number;
  expanded: boolean;
}) {
  const { view, subview, setView, openSubview, selectedId } = useStore();
  const [open, setOpen] = useState(false);

  const hasSubs = !!item.subpages?.length;
  const showBadge = typeof badge === "number" && badge > 0;
  const onThisView = view === item.id;
  // Which subpage is showing. A null `subview` means the destination's first one
  // (`defaultSubpage`) — that is what its router renders — so the rail has to
  // read it the same way or the open screen would have no row lit.
  const openSub = onThisView ? subview ?? defaultSubpage(item.id) : null;
  // An open issue is effectively an active "subpage": when one is selected it
  // carries the selection (via its pinned OpenItem), so the parent shouldn't
  // also render as selected.
  const issueOpen = item.id === "activity" && openSub === "issues" && selectedId !== null;
  // A destination with subpages is never itself the active row — one of its
  // subpages always is. Lighting both would claim two places at once.
  const parentActive = onThisView && !hasSubs && !issueOpen;

  // Keep the current page's subtree expanded.
  useEffect(() => {
    if (onThisView && hasSubs) setOpen(true);
  }, [onThisView, hasSubs]);

  // Clicking the parent goes to its first subpage rather than to a bare view:
  // `setView` clears the subview, which would render that subpage anyway but
  // leave every row in the group unlit.
  const navigateParent = () => {
    const sub = defaultSubpage(item.id);
    if (sub) {
      openSubview(item.id, sub);
      setOpen(true);
    } else {
      setView(item.id);
    }
  };

  return (
    <div className="group relative flex w-full flex-col">
      {/* One full-width layout for both states: the icon is pinned at a fixed left
          offset (pl-2.5), which centres it on the collapsed rail axis, so it never
          moves as the rail animates. The label, inline badge and chevron are always
          mounted and cross-fade (`.rail-fade`); the corner badge fades the opposite
          way (`.rail-fade-collapsed`). A right gutter (pr-9) keeps expanded badges
          aligned and holds the overlaid chevron. */}
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={navigateParent}
          aria-label={showBadge ? `${item.label} (${badge})` : item.label}
          aria-current={parentActive ? "page" : undefined}
          className={
            // pr-9 reserves the badge/chevron gutter when expanded. Collapsed it
            // would become the button's minimum width (padding can't collapse) and
            // make the tile too wide, so drop it to pr-2.5 there.
            "rail-item focusable relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg pl-2.5 transition-colors " +
            (expanded ? "pr-9 " : "pr-2.5 ") +
            (parentActive ? "text-primary-foreground" : "text-tertiary-foreground hover:text-primary-foreground")
          }
        >
          <span className="rail-hl" data-active={parentActive ? "true" : undefined} aria-hidden />
          <span className="relative flex size-5 shrink-0 items-center justify-center">
            {icon}
            {showBadge && (
              <span className="rail-fade-collapsed absolute" style={{ top: -6, right: -6 }}>
                <CountBadge count={badge} variant="corner" />
              </span>
            )}
          </span>
          <span className="rail-fade relative min-w-0 flex-1 truncate text-left text-body-sm font-medium">{item.label}</span>
          {showBadge && (
            <span className="rail-fade relative shrink-0">
              <CountBadge count={badge} variant="inline" />
            </span>
          )}
        </button>

        {hasSubs && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
            aria-expanded={open}
            className="rail-fade focusable absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            <ChevronRight
              size={16}
              strokeWidth={1.7}
              style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
            />
          </button>
        )}
      </div>

      {/* Expanded subpage list */}
      {expanded && hasSubs && open && (
        <div
          className="animate-in fade-in-0 duration-150 ease-out mt-1 flex flex-col gap-0.5"
          style={{ marginLeft: 14, borderLeft: "0.5px solid var(--color-border-default)", paddingLeft: 8 }}
        >
          {item.subpages!.map((sp) => {
            const subActive = openSub === sp.id;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => openSubview(item.id, sp.id)}
                aria-current={subActive ? "page" : undefined}
                className={
                  "focusable flex h-8 items-center gap-2 rounded-md px-2 text-left transition-colors " +
                  (subActive ? "text-primary-foreground" : "text-tertiary-foreground hover:bg-transparent-hover hover:text-primary-foreground")
                }
                style={subActive ? ACTIVE_ITEM_STYLE : undefined}
              >
                <span className="flex shrink-0 items-center justify-center text-tertiary-foreground">{HashIcon}</span>
                <span className="min-w-0 flex-1 truncate text-body-sm">{sp.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Collapsed hover popup: flyout if it has subpages, else name tooltip */}
      {!expanded &&
        (hasSubs ? (
          <RailFlyout
            title={item.label}
            subpages={item.subpages!}
            onParent={navigateParent}
            onSub={(sub) => openSubview(item.id, sub)}
          />
        ) : (
          <RailTooltip label={item.label} />
        ))}
    </div>
  );
}
