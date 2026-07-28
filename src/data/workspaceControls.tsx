import type { ReactNode } from "react";
import {
  ChartNoAxesColumn,
  CircleDashed,
  CircleUser,
  Globe,
  MoreHorizontal,
  Package,
  Play,
  Plus,
  ShieldCheck,
  Tag,
  Zap,
} from "lucide-react";
import type { View } from "../store";
import type { SortDir } from "../lib/workspace";
import { PRIORITIES, RUN_STATES, RUN_TRIGGERS, STATUSES, type Role, type RunState } from "./types";
import { members } from "./issues";
import { AUTOMATION_STATUS_ACCENT, PRIORITY_ACCENT, RUN_STATE_ACCENT, STATUS_ACCENT } from "../components/Badges";
import { endUsers } from "./users";
import { ACTIONS } from "./actions";

/* =============================================================================
   Per-page workspace controls
   -----------------------------------------------------------------------------
   Declarative descriptors for the shared <WorkspaceHeader> — the bar above the
   panes that carries a page's search, filters, sort, and actions. A page opts in
   simply by appearing here, exactly like `VIEW_MODES` drives the titlebar's
   layout switcher.

   This file declares what the bar *shows*. What a filter or sort *means* stays
   with the page that owns the data (it maps these ids onto its own rows), so the
   header never needs to know about issues, runs, or automations.

   Scope: workspace-level controls only. Controls that belong to one pane — a
   detail's content tabs, the Activity sources list — stay with that pane.
   ============================================================================= */

/** One choice in a filter menu. `accent` is a Radix scale prefix, drawn as a dot
 *  beside the option so states and priorities read the same in the menu as they
 *  do in the rows. */
export type FilterOption = { id: string; label: string; accent?: string };

/** A filterable dimension: `label` names it ("Status"), `icon` marks it in the
 *  filter menu and on the chip it becomes once applied. */
export type FilterDef = { id: string; label: string; icon?: ReactNode; options: FilterOption[] };

/** One sort order. The first declared sort is a page's default; `defaultDir` is
 *  the direction it starts in, which the reader can flip on the chip. Labels name
 *  the field, never the direction — the arrow says which way it runs. */
export type SortDef = { id: string; label: string; defaultDir?: SortDir };

/** A page-level action, pinned to the right of the bar. `roles`, when present,
 *  restricts it (permission gating, same as the nav); `iconOnly` renders a square
 *  icon button, with `label` as its accessible name. */
export type ActionDef = {
  id: string;
  label: string;
  icon?: ReactNode;
  roles?: Role[];
  iconOnly?: boolean;
  /** Keyboard hint rendered as a <kbd> beside the label. */
  hint?: string;
};

/** Everything the header renders for one page. Any part may be omitted — a page
 *  with no meaningful filter simply declares none rather than a dead control. */
export type WorkspaceControls = {
  /** Search placeholder; omit for pages with nothing to search. */
  search?: string;
  filters?: FilterDef[];
  sorts?: SortDef[];
  actions?: ActionDef[];
};

const option = <T extends string>(id: T, accent?: string): FilterOption => ({ id, label: id, accent });
const newIcon = <Plus size={14} strokeWidth={2} />;
const dim = { size: 15, strokeWidth: 1.7 } as const;

/** Options carrying the accent their own rows use. Each dimension passes its own
 *  palette, because a value's colour is per-vocabulary — "Active" is tomato for an
 *  incident and grass for an automation. */
const fromPalette =
  (palette: Record<string, string>) =>
  <T extends string>(id: T): FilterOption =>
    option(id, palette[id]);

const ENVIRONMENT_ACCENT: Record<string, string> = { Healthy: "grass", Building: "amber", Degraded: "tomato" };
const PLATFORM_USER_ACCENT: Record<string, string> = { Active: "grass", Invited: "amber", Suspended: "tomato" };

/* ------------------------------------------------------------------- per page */

const INBOX: WorkspaceControls = {
  search: "Search or filter issues…",
  filters: [
    { id: "status", label: "Status", icon: <CircleDashed {...dim} />, options: STATUSES.map(fromPalette(STATUS_ACCENT)) },
    { id: "priority", label: "Priority", icon: <ChartNoAxesColumn {...dim} />, options: PRIORITIES.map(fromPalette(PRIORITY_ACCENT)) },
    {
      id: "assignee",
      label: "Assignee",
      icon: <CircleUser {...dim} />,
      options: members.map((m) => ({ id: m.id, label: m.name, accent: m.accent })),
    },
  ],
  sorts: [
    { id: "priority", label: "Priority", defaultDir: "desc" },
    { id: "impact", label: "Impacted users", defaultDir: "desc" },
    { id: "id", label: "Created", defaultDir: "desc" },
  ],
};

/** The run states each Activity tab covers, so the State filter only ever offers
 *  states that tab can show. Insights spans the whole stream. */
const ACTIVITY_TAB_STATES: Record<string, readonly RunState[]> = {
  "In progress": ["Running", "Queued"],
  Historical: ["Completed", "Failed"],
};

function activity(tab: string): WorkspaceControls {
  const states = ACTIVITY_TAB_STATES[tab] ?? RUN_STATES;
  return {
    search: "Search or filter activity…",
    filters: [
      { id: "state", label: "State", icon: <CircleDashed {...dim} />, options: states.map(fromPalette(RUN_STATE_ACCENT)) },
      { id: "trigger", label: "Trigger", icon: <Zap {...dim} />, options: RUN_TRIGGERS.map((t) => option(t)) },
    ],
    // Insights is a report over the narrowed set — there's no row order to choose.
    sorts:
      tab === "Insights"
        ? undefined
        : [
            { id: "recent", label: "Started", defaultDir: "desc" },
            { id: "duration", label: "Duration", defaultDir: "desc" },
            { id: "automation", label: "Automation", defaultDir: "asc" },
          ],
  };
}

const AUTOMATIONS: WorkspaceControls = {
  search: "Search or filter automations…",
  filters: [
    {
      id: "status",
      label: "Status",
      icon: <CircleDashed {...dim} />,
      options: ["Active", "Paused", "Draft"].map(fromPalette(AUTOMATION_STATUS_ACCENT)),
    },
    {
      id: "visibility",
      label: "Visibility",
      icon: <Globe {...dim} />,
      options: [
        { id: "public", label: "Public" },
        { id: "private", label: "Private" },
      ],
    },
  ],
  sorts: [
    { id: "name", label: "Name", defaultDir: "asc" },
    { id: "runs", label: "Runs", defaultDir: "desc" },
    { id: "success", label: "Success rate", defaultDir: "desc" },
    { id: "recent", label: "Last run", defaultDir: "desc" },
  ],
  actions: [{ id: "new-automation", label: "New automation", icon: newIcon, roles: ["admin", "developer"] }],
};

const USERS: WorkspaceControls = {
  search: "Search or filter users…",
  filters: [
    {
      id: "country",
      label: "Country",
      icon: <Globe {...dim} />,
      // Derived from the seed directory, so the menu can't drift from the data.
      options: [...new Set(endUsers.map((u) => u.country))].sort().map((c) => option(c)),
    },
    {
      id: "problems",
      label: "Problems",
      icon: <Tag {...dim} />,
      options: [
        { id: "with", label: "With problems" },
        { id: "without", label: "No problems" },
      ],
    },
  ],
  sorts: [
    { id: "name", label: "Name", defaultDir: "asc" },
    { id: "problems", label: "Problems", defaultDir: "desc" },
    { id: "sessions", label: "Sessions", defaultDir: "desc" },
  ],
};

const ENVIRONMENTS: WorkspaceControls = {
  search: "Search or filter environments…",
  filters: [
    {
      id: "status",
      label: "Status",
      icon: <CircleDashed {...dim} />,
      options: ["Healthy", "Building", "Degraded"].map(fromPalette(ENVIRONMENT_ACCENT)),
    },
  ],
  sorts: [
    { id: "name", label: "Name", defaultDir: "asc" },
    { id: "events", label: "Events / min", defaultDir: "desc" },
    { id: "surfaces", label: "Surfaces", defaultDir: "desc" },
  ],
};

/** The builder's controls act on its palette — the only collection on that
 *  screen. Sorting by name flattens the grouping into one alphabetical list. */
const BUILDER: WorkspaceControls = {
  search: "Search or filter actions…",
  filters: [
    {
      id: "package",
      label: "Package",
      icon: <Package {...dim} />,
      options: [...new Set(ACTIONS.map((a) => a.package))].map((p) => option(p)),
    },
  ],
  sorts: [
    { id: "package", label: "Package", defaultDir: "asc" },
    { id: "name", label: "Name", defaultDir: "asc" },
  ],
};

const SURFACES: WorkspaceControls = {
  search: "Search events…",
  actions: [
    { id: "all-problems", label: "View all problems", hint: "P" },
    { id: "options", label: "Surface options", icon: <MoreHorizontal size={16} strokeWidth={1.8} />, iconOnly: true },
  ],
};

/** Manage's tabs hold different objects, so its filters follow the active tab —
 *  only the tabs whose rows carry an enabled/paused state offer that filter. */
const MANAGE_ENABLED: FilterDef = {
  id: "enabled",
  label: "State",
  icon: <Play {...dim} />,
  options: [
    { id: "enabled", label: "Enabled", accent: "grass" },
    { id: "paused", label: "Paused", accent: "gray" },
  ],
};

function manage(tab: string): WorkspaceControls {
  const togglable = tab === "Scheduled" || tab === "Event triggers";
  return {
    search: `Search or filter ${tab.toLowerCase()}…`,
    filters: togglable ? [MANAGE_ENABLED] : undefined,
    actions: [{ id: "new", label: "New", icon: newIcon, roles: ["admin", "developer"] }],
  };
}

function administration(tab: string): WorkspaceControls {
  const isUsers = tab === "Users";
  return {
    search: `Search or filter ${tab.toLowerCase()}…`,
    filters: isUsers
      ? [
          {
            id: "role",
            label: "Role",
            icon: <ShieldCheck {...dim} />,
            options: [
              { id: "admin", label: "Admin", accent: "violet" },
              { id: "developer", label: "Developer", accent: "blue" },
              { id: "user", label: "User", accent: "gray" },
            ],
          },
          {
            id: "status",
            label: "Status",
            icon: <CircleUser {...dim} />,
            options: ["Active", "Invited", "Suspended"].map(fromPalette(PLATFORM_USER_ACCENT)),
          },
        ]
      : undefined,
    actions: isUsers ? [{ id: "invite", label: "Invite", icon: newIcon, roles: ["admin"] }] : undefined,
  };
}

/* ------------------------------------------------------------------- lookup */

/**
 * The controls for a page. `tab` is the page's active section tab, for the pages
 * that have one (Activity, Manage, Administration) — their controls follow the
 * objects on screen. Other pages ignore it. Returns null for pages with no
 * controls, and the header hides itself.
 */
export function workspaceControls(view: View, tab: string): WorkspaceControls | null {
  switch (view) {
    case "inbox":
      return INBOX;
    case "activity":
      return activity(tab || "In progress");
    case "automations":
      return AUTOMATIONS;
    case "users":
      return USERS;
    case "environments":
      return ENVIRONMENTS;
    case "surfaces":
      return SURFACES;
    case "builder":
      return BUILDER;
    case "manage":
      return manage(tab || "Scheduled");
    case "administration":
      return administration(tab || "Users");
    default:
      return null;
  }
}
