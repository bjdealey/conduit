import type { View } from "../store";
import type { Role } from "./types";
import type { Capability } from "@conduit/domain";

/** A subpage under a top-level sidebar page. */
export type SubPage = { id: string; label: string };

/** `roles`, when present, restricts the item to those roles (permission gating).
 *  `capability`, when present, shows the item only while that capability is enabled by
 *  some connector — the UI is driven by declared capabilities, not vendor identity. */
export type NavItemDef = {
  id: View;
  label: string;
  subpages?: readonly SubPage[];
  roles?: readonly Role[];
  capability?: Capability;
};

/**
 * Navigation structure.
 *
 * Five destinations, not eleven. The rail carried one item per screen until the
 * screens outnumbered the ideas behind them: two things called "Users" meaning
 * two different populations, four queues that are one queue at four fidelities,
 * and a "Manage" holding both *how a workflow starts* and *what a run consumes*.
 * A destination here is a place in the product, and its subpages are the ways of
 * looking at it.
 *
 * Items with `subpages` expand in the sidebar and show a hover flyout when
 * collapsed — machinery `NavGroup`/`RailFlyout` have always had and nothing used.
 *
 * Two placements are deliberate and shouldn't be casually undone:
 *
 * - **Triggers sits under Workflows, not Runners.** A schedule is
 *   `{workflowId, cadence}` and its first column is the workflow. Filing *when*
 *   something runs beside *the machines it runs on* re-associates the two, which
 *   is the habit the no-assignment inversion exists to remove.
 * - **Review, Audit and Administration are one destination.** All three carried
 *   the identical role gate already; they are the same job at three tempos —
 *   act on it, read what happened, set the rules.
 */
const NAV = [
  { id: "home", label: "Home" },
  {
    id: "workflows",
    label: "Workflows",
    capability: "workflows" as Capability,
    subpages: [
      { id: "library", label: "Library" },
      { id: "triggers", label: "Triggers" },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    subpages: [
      { id: "runs", label: "Runs" },
      { id: "issues", label: "Issues" },
    ],
  },
  { id: "runners", label: "Runners", capability: "devices" as Capability },
  {
    id: "governance",
    label: "Governance",
    roles: ["admin", "professional"],
    subpages: [
      { id: "review", label: "Review" },
      { id: "audit", label: "Audit" },
      { id: "administration", label: "Administration" },
    ],
  },
  { id: "settings", label: "Settings" },
] as const satisfies readonly NavItemDef[];

/** The nav as its consumers read it: every item is a `NavItemDef`, so `roles`,
 *  `capability` and `subpages` are optional properties rather than keys that only
 *  exist on the items that happen to declare them. `NAV` keeps the narrow literal
 *  types, which is what `Section` is derived from. */
export const navItems: readonly NavItemDef[] = NAV;

/* ---------------------------------------------------------------- sections */

/**
 * A **section** is the finest-grained place a reader can be: a destination
 * without subpages, or one of a destination's subpages (`"governance/audit"`).
 *
 * `View` used to be that granularity, and stopped being it the moment a
 * destination held more than one screen — Governance's Review and Audit need
 * different search placeholders, different tab memory and different readiness,
 * and keying any of those by `View` would give all three the same one. Every
 * per-page mechanism (`workspaceControls`, the store's `controls` and
 * `sectionTabs`, `VIEW_MODES`, `CONTEXT_LABEL`, `readinessOf`) keys on this.
 *
 * Derived from `navItems` rather than written out, so adding a subpage without
 * giving it controls or a readiness level is a compile error, not a screen that
 * silently falls back to its neighbour's.
 */
type SectionOf<T> = T extends { id: infer V extends string; subpages: readonly { id: infer S extends string }[] }
  ? `${V}/${S}`
  : T extends { id: infer V extends string }
    ? V
    : never;

/** The builder is a mode rather than a destination, so it isn't in `navItems` —
 *  but it has controls and a readiness like any other screen, so it is a section. */
export type Section = SectionOf<(typeof NAV)[number]> | "builder";

/** Every section, in nav order. Used by the tests that assert each one declares
 *  what a page has to declare. */
export const SECTIONS: readonly Section[] = [
  ...NAV.flatMap((item) =>
    "subpages" in item ? item.subpages.map((sub) => `${item.id}/${sub.id}` as Section) : [item.id as Section],
  ),
  "builder",
];

/** The subpage a destination opens on when you click the parent. The first one
 *  declared — the rail reads top-down, so the first is the one you'd land on if
 *  you had opened the group and clicked. */
export function defaultSubpage(view: View): string | null {
  const item = NAV.find((i) => i.id === view);
  return item && "subpages" in item ? item.subpages[0].id : null;
}

/**
 * The section a (view, subview) pair names. A view whose subview is unset reads
 * as its default subpage, so `section` is never ambiguous about where you are.
 *
 * ⚠️ `subview` is only a *nav* subpage on the destinations that declare them.
 * Settings reuses the same field for its own page list (`SETTINGS_PAGES`), which
 * are not sections — so the subview is read off `navItems` rather than trusted,
 * or `settings` + the Resources page would mint `"settings/resources"`, a section
 * that exists nowhere. Every lookup keyed by section then misses, and the first
 * one that indexes a total record (`readinessOf`) takes the page down.
 */
export function sectionOf(view: View, subview: string | null): Section {
  const declared = NAV.find((i) => i.id === view);
  if (!declared || !("subpages" in declared)) return view as Section;
  const sub = declared.subpages.some((s) => s.id === subview) ? subview : declared.subpages[0].id;
  return `${view}/${sub}` as Section;
}

/** How many destinations the phone's bottom bar shows before "More". Five slots
 *  across the narrowest phone leaves ~72px each — a comfortable tap target with
 *  its label still legible — so four destinations plus the overflow. */
export const MOBILE_BAR_SLOTS = 4;

/** The destinations that earn a permanent slot on the bottom bar, in bar order.
 *
 *  Everything else stays reachable behind "More" — the bar is a shortcut to the
 *  work, not a second copy of the sidebar. These four are the ones a phone is
 *  actually used for: checking what ran, what needs attention, and what exists.
 *  Governance is desk work and sits in the sheet.
 *
 *  Order is independent of `navItems` because the bar is read left-to-right
 *  under the thumb, not scanned top-down. Gating still applies first: an item the
 *  current tier or capability set hides never takes a slot (`splitDestinations`). */
export const MOBILE_BAR: View[] = ["home", "workflows", "activity", "runners"];
