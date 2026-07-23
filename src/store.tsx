import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { issues as seedIssues, members } from "./data/issues";
import { automations as seedAutomations, folders as seedFolders, runs as seedRuns } from "./data/automations";
import { currentUser } from "./data/user";
import { workspaces } from "./data/workspaces";
import type { Workspace } from "./data/workspaces";
import { palettes, type Palette } from "./data/palettes";
import { applyBrand } from "./lib/palette";
import { isDark, setTheme } from "./lib/theme";
import type { Automation, Folder, Issue, Member, Priority, Role, Run, Status } from "./data/types";

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

/** Top-level navigation destinations (the sidebar rail). */
export type View =
  | "activity"
  | "inbox"
  | "automations"
  | "manage"
  | "users"
  | "administration"
  | "surfaces"
  | "environments"
  | "settings";

type Store = {
  issues: Issue[];
  members: Member[];
  /** Automation library (first-class entity), its folder tree, and run history. */
  automations: Automation[];
  folders: Folder[];
  runs: Run[];
  automationById: (id: string) => Automation | undefined;
  /** Runs for one automation, newest first (seed order). */
  runsForAutomation: (automationId: string) => Run[];
  /** The signed-in user's role — gates permission-scoped UI. Switchable in
   *  Settings so the gating is demonstrable in the prototype. */
  role: Role;
  setRole: (r: Role) => void;
  selectedId: number | null;
  selected: Issue | null;
  query: string;
  view: View;
  /** Active subpage id within the current view, or null. */
  subview: string | null;
  sidebarExpanded: boolean;
  /** Inbox presentation: the grouped list, or the kanban board. */
  inboxLayout: "list" | "board";
  setInboxLayout: (layout: "list" | "board") => void;
  workspaces: Workspace[];
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
  /** Issues opened in the current session, pinned in the sidebar (in open order). */
  openIds: number[];
  select: (id: number | null) => void;
  setQuery: (q: string) => void;
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
  /** Command palette (universal search). */
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  /** Light/dark theme (mirrors the `dark` class on <html>). */
  dark: boolean;
  toggleTheme: () => void;
  /** Auth gate (temporary — any email/provider signs in; persisted locally). */
  authed: boolean;
  signIn: () => void;
  signOut: () => void;
  memberById: (id: string) => Member | undefined;
  updateIssue: (id: number, patch: Partial<Pick<Issue, "status" | "priority" | "assigneeId">>) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>(seedIssues);
  const [selectedId, setSelectedId] = useState<number | null>(seedIssues[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [view, setViewRaw] = useState<View>("inbox");
  const [subview, setSubview] = useState<string | null>(null);
  const [settingsReturn, setSettingsReturn] = useState<View>("inbox");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [inboxLayout, setInboxLayoutState] = useState<"list" | "board">(() =>
    read("inbox-layout", "list") === "board" ? "board" : "list",
  );
  const [workspaceId, setWorkspaceId] = useState(workspaces[0].id);
  const [openIds, setOpenIds] = useState<number[]>(selectedId != null ? [selectedId] : []);

  // Appearance preferences (persisted).
  const [backgroundEnabled, setBgState] = useState(() => read("bg-enabled", "on") !== "off");
  const [bordersEnabled, setBordersState] = useState(() => read("borders-enabled", "off") === "on");
  const [badgesEnabled, setBadgesState] = useState(() => read("badges-enabled", "on") !== "off");
  const [paletteId, setPaletteState] = useState(() => read("palette", palettes[0].id));
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(() => isDark());
  const [role, setRoleState] = useState<Role>(() => read("role", currentUser.role) as Role);
  const [authed, setAuthed] = useState(() => read("authed", "no") === "yes");
  const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];

  const setBackgroundEnabled = (on: boolean) => {
    setBgState(on);
    write("bg-enabled", on ? "on" : "off");
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

  const memberIndex = useMemo(() => new Map(members.map((m) => [m.id, m])), []);

  // Navigating to a top-level page clears any active subpage. Entering Settings
  // (a full-screen mode) remembers the view to return to on "Back".
  const setView = (v: View) => {
    if (v === "settings" && view !== "settings") setSettingsReturn(view);
    setViewRaw(v);
    setSubview(null);
  };
  const openSubview = (v: View, sub: string) => {
    if (v === "settings" && view !== "settings") setSettingsReturn(view);
    setViewRaw(v);
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

  const value: Store = {
    issues,
    members,
    automations: seedAutomations,
    folders: seedFolders,
    runs: seedRuns,
    automationById: (id) => seedAutomations.find((a) => a.id === id),
    runsForAutomation: (automationId) => seedRuns.filter((r) => r.automationId === automationId),
    role,
    setRole: (r) => {
      setRoleState(r);
      write("role", r);
      // A demoted viewer loses the Administration surface they may be looking at.
      if (r === "user" && view === "administration") {
        setViewRaw("inbox");
        setSubview(null);
      }
    },
    selectedId,
    selected: issues.find((i) => i.id === selectedId) ?? null,
    query,
    view,
    subview,
    sidebarExpanded,
    inboxLayout,
    setInboxLayout: (layout) => {
      setInboxLayoutState(layout);
      write("inbox-layout", layout);
    },
    workspaces,
    workspace: workspaces.find((w) => w.id === workspaceId) ?? workspaces[0],
    setWorkspaceId,
    openIds,
    select,
    setQuery,
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
    signIn: () => {
      setAuthed(true);
      write("authed", "yes");
    },
    signOut: () => {
      setAuthed(false);
      write("authed", "no");
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
