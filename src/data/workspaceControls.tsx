import type { ReactNode } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { View } from "../store";
import { PRIORITIES, RUN_STATES, RUN_TRIGGERS, STATUSES, type Role, type RunState } from "./types";
import { members } from "./issues";
import { endUsers } from "./users";

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

/** One choice in a filter menu. The implicit "All" option is added by the header. */
export type FilterOption = { id: string; label: string };

/** A filter menu: `label` names the dimension ("Status"), and the selected
 *  option's label replaces it once one is chosen. */
export type FilterDef = { id: string; label: string; options: FilterOption[] };

/** One sort order. The first declared sort is a page's default. */
export type SortDef = { id: string; label: string };

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

const option = <T extends string>(id: T): FilterOption => ({ id, label: id });
const newIcon = <Plus size={14} strokeWidth={2} />;

/* ------------------------------------------------------------------- per page */

const INBOX: WorkspaceControls = {
  search: "Search issues…",
  filters: [
    { id: "status", label: "Status", options: STATUSES.map(option) },
    { id: "priority", label: "Priority", options: PRIORITIES.map(option) },
    { id: "assignee", label: "Assignee", options: members.map((m) => ({ id: m.id, label: m.name })) },
  ],
  sorts: [
    { id: "priority", label: "Priority" },
    { id: "impact", label: "Impacted users" },
    { id: "id", label: "Newest" },
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
    search: "Search activity…",
    filters: [
      { id: "state", label: "State", options: states.map(option) },
      { id: "trigger", label: "Trigger", options: RUN_TRIGGERS.map(option) },
    ],
    // Insights is a report over the narrowed set — there's no row order to choose.
    sorts:
      tab === "Insights"
        ? undefined
        : [
            { id: "recent", label: "Most recent" },
            { id: "duration", label: "Longest" },
            { id: "automation", label: "Automation" },
          ],
  };
}

const AUTOMATIONS: WorkspaceControls = {
  search: "Search automations…",
  filters: [
    { id: "status", label: "Status", options: [option("Active"), option("Paused"), option("Draft")] },
    {
      id: "visibility",
      label: "Visibility",
      options: [
        { id: "public", label: "Public" },
        { id: "private", label: "Private" },
      ],
    },
  ],
  sorts: [
    { id: "name", label: "Name" },
    { id: "runs", label: "Most runs" },
    { id: "success", label: "Success rate" },
    { id: "recent", label: "Recently run" },
  ],
  actions: [{ id: "new-automation", label: "New automation", icon: newIcon, roles: ["admin", "developer"] }],
};

const USERS: WorkspaceControls = {
  search: "Search users…",
  filters: [
    {
      id: "country",
      label: "Country",
      // Derived from the seed directory, so the menu can't drift from the data.
      options: [...new Set(endUsers.map((u) => u.country))].sort().map(option),
    },
    {
      id: "problems",
      label: "Problems",
      options: [
        { id: "with", label: "With problems" },
        { id: "without", label: "No problems" },
      ],
    },
  ],
  sorts: [
    { id: "name", label: "Name" },
    { id: "problems", label: "Most problems" },
    { id: "sessions", label: "Most sessions" },
  ],
};

const ENVIRONMENTS: WorkspaceControls = {
  search: "Search environments…",
  filters: [
    { id: "status", label: "Status", options: [option("Healthy"), option("Building"), option("Degraded")] },
  ],
  sorts: [
    { id: "name", label: "Name" },
    { id: "events", label: "Busiest" },
    { id: "surfaces", label: "Most surfaces" },
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
  options: [
    { id: "enabled", label: "Enabled" },
    { id: "paused", label: "Paused" },
  ],
};

function manage(tab: string): WorkspaceControls {
  const togglable = tab === "Scheduled" || tab === "Event triggers";
  return {
    search: `Search ${tab.toLowerCase()}…`,
    filters: togglable ? [MANAGE_ENABLED] : undefined,
    actions: [{ id: "new", label: "New", icon: newIcon, roles: ["admin", "developer"] }],
  };
}

function administration(tab: string): WorkspaceControls {
  const isUsers = tab === "Users";
  return {
    search: `Search ${tab.toLowerCase()}…`,
    filters: isUsers
      ? [
          {
            id: "role",
            label: "Role",
            options: [
              { id: "admin", label: "Admin" },
              { id: "developer", label: "Developer" },
              { id: "user", label: "User" },
            ],
          },
          { id: "status", label: "Status", options: [option("Active"), option("Invited"), option("Suspended")] },
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
    case "manage":
      return manage(tab || "Scheduled");
    case "administration":
      return administration(tab || "Users");
    default:
      return null;
  }
}
