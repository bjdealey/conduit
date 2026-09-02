import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, Hash, Search, Sparkles, SunMoon } from "lucide-react";
import { useStore } from "../store";
import { navItems } from "../data/nav";

const cmdIconProps = { size: 18, strokeWidth: 1.7 };
const ArrowIcon = <ArrowUpRight {...cmdIconProps} />;
const HashIcon = <Hash {...cmdIconProps} />;
const ThemeCmdIcon = <SunMoon {...cmdIconProps} />;
const BgCmdIcon = <Sparkles {...cmdIconProps} />;
const SearchIcon = <Search size={18} strokeWidth={1.8} />;

type Cmd = { id: string; label: string; icon: ReactNode; run: () => void };
type Group = { heading: string; items: Cmd[] };

/** Universal search / command palette (⌘K). Mounted once at the app root. */
export function CommandPalette() {
  const store = useStore();
  const { searchOpen, closeSearch, toggleSearch } = store;

  // No open/close animation, deliberately. ⌘K is reached hundreds of times a day,
  // and a keyboard-initiated action is the one case where motion is pure latency:
  // there is no spatial relationship to explain and no state change to clarify —
  // the palette is simply either there or it isn't. This used to fade and rise
  // over 180ms in each direction, which is 180ms before you can read the results
  // of something you asked for instantly. (Raycast opens the same way, and for
  // the same reason.)
  //
  // Everything below therefore keys straight off `searchOpen` — there is no
  // mounted-but-invisible state to keep in step with it.

  // Global ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSearch]);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [searchOpen]);
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => setActiveIndex(0), [query]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const m = (s: string) => !q || s.toLowerCase().includes(q);

    // Built from `navItems`, not a second list beside it. The hand-written copy
    // this replaces had drifted into naming destinations that no longer existed,
    // which a palette is the worst place for: it is where you go when you can't
    // find something. Gating is the rail's, so a destination your tier or
    // capability set hides is not offered here either.
    const nav: Cmd[] = navItems
      .filter((item) => (!item.roles || item.roles.includes(store.role)) && (!item.capability || store.hasCapability(item.capability)))
      .flatMap((item) =>
        // A destination with subpages is reachable by each of them, named for
        // where you actually land ("Governance → Audit"). Offering the parent as
        // well would be a third row going to the same screen as the first child.
        item.subpages?.length
          ? item.subpages.map((sub) => ({
              id: `nav-${item.id}-${sub.id}`,
              label: `Go to ${item.label} → ${sub.label}`,
              icon: ArrowIcon,
              run: () => {
                store.openSubview(item.id, sub.id);
                store.closeSearch();
              },
            }))
          : [
              {
                id: `nav-${item.id}`,
                label: `Go to ${item.label}`,
                icon: ArrowIcon,
                run: () => {
                  store.setView(item.id);
                  store.closeSearch();
                },
              },
            ],
      )
      .filter((c) => m(c.label));

    const actions: Cmd[] = [
      { id: "act-theme", label: "Toggle theme", icon: ThemeCmdIcon, run: () => { store.toggleTheme(); store.closeSearch(); } },
      {
        id: "act-bg",
        label: store.backgroundEnabled ? "Disable animated background" : "Enable animated background",
        icon: BgCmdIcon,
        run: () => { store.setBackgroundEnabled(!store.backgroundEnabled); store.closeSearch(); },
      },
    ].filter((c) => m(c.label));

    const issues: Cmd[] = q
      ? store.issues
          .filter((i) => i.title.toLowerCase().includes(q) || String(i.id).includes(q))
          .slice(0, 6)
          .map((i) => ({
            id: `issue-${i.id}`,
            label: `#${i.id}  ${i.title}`,
            icon: HashIcon,
            run: () => { store.select(i.id); store.openSubview("activity", "issues"); store.closeSearch(); },
          }))
      : [];

    const g: Group[] = [];
    if (actions.length) g.push({ heading: "Quick start", items: actions });
    if (nav.length) g.push({ heading: "Navigation", items: nav });
    if (issues.length) g.push({ heading: "Issues", items: issues });
    return g;
  }, [query, store]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  if (!searchOpen) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[activeIndex]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
  };

  let running = -1;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div
        onClick={closeSearch}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="overflow-hidden rounded-2xl border-border-default border-[0.5px] bg-page"
        style={{
          position: "fixed",
          left: "50%",
          top: "14vh",
          width: "min(90vw, 640px)",
          transform: "translateX(-50%)",
          boxShadow: "var(--s-modal)",
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-border-default border-b-[0.5px] px-4" style={{ height: 56 }}>
          <span className="shrink-0 text-tertiary-foreground">{SearchIcon}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            className="min-w-0 flex-1 bg-transparent text-body-base text-primary-foreground outline-none placeholder:text-tertiary-foreground"
          />
        </div>

        {/* Results */}
        <div className="scrollbar-none flex flex-col overflow-y-auto py-2" style={{ maxHeight: "min(50vh, 420px)" }}>
          {flat.length === 0 && (
            <div className="px-4 py-8 text-center text-body-sm text-tertiary-foreground">No results.</div>
          )}
          {groups.map((group) => (
            <div key={group.heading} className="mb-1">
              <div className="px-4 pt-2 pb-1 text-body-sm text-tertiary-foreground">{group.heading}</div>
              {group.items.map((item) => {
                running += 1;
                const idx = running;
                const active = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={item.run}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center text-tertiary-foreground">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-body-base text-primary-foreground">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
