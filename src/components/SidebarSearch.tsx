import { ArrowRight, Search } from "lucide-react";
import { useStore } from "../store";
import { RailTooltip } from "./RailTooltip";

const SearchIcon = <Search size={16} strokeWidth={1.8} className="shrink-0" />;

/** Universal search trigger in the sidebar (first item under the logo). Opens the
 *  command palette. Renders as a search field when expanded, an icon when collapsed. */
export function SidebarSearch({ expanded }: { expanded: boolean }) {
  const { openSearch } = useStore();

  // Single full-width control in both states. The search glyph is pinned (centred
  // on the rail axis when collapsed); the field background + border, the "Search…"
  // text and the arrow cross-fade, so the field morphs into a lone icon and back.
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search"
      className="search-field group pressable focusable relative flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 text-tertiary-foreground transition-colors hover:text-secondary-foreground"
    >
      <span className="rail-hl" aria-hidden />
      <span className="rail-fade pointer-events-none absolute inset-0 rounded-lg border-border-strong border-[0.5px] bg-component" aria-hidden />
      <span className="relative flex size-5 shrink-0 items-center justify-center">{SearchIcon}</span>
      <span className="rail-fade relative min-w-0 flex-1 truncate text-left text-body-sm">Search…</span>
      <ArrowRight size={16} strokeWidth={1.8} className="search-arrow rail-fade relative shrink-0 text-secondary-foreground" />
      {!expanded && <RailTooltip label="Search" />}
    </button>
  );
}
