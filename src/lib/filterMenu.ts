import type { FilterDef, FilterOption, SortDef, WorkspaceControls } from "../data/workspaceControls";
import { matchesQuery } from "./workspace";

/* =============================================================================
   Filter menu logic
   -----------------------------------------------------------------------------
   The type-ahead behind the Filter button. Typing narrows to whole dimensions
   ("stat" → Status) *and* to individual values across every dimension ("backlog"
   → Status is Backlog), so a value you know by name is one keystroke and one
   click away rather than two menus deep. Sorting is offered from the same menu.
   ============================================================================= */

/** A row in the first step of the menu. */
export type MenuEntry =
  | { kind: "field"; field: FilterDef }
  /** A value matched directly by the query — applying it skips the second step. */
  | { kind: "value"; field: FilterDef; option: FilterOption }
  | { kind: "sort"; sorts: SortDef[] };

/**
 * The menu's first step for a query. With no query it lists the dimensions (and
 * the sort entry); as you type, matching values are offered directly beneath the
 * dimensions they belong to.
 */
export function menuEntries(controls: WorkspaceControls, query: string): MenuEntry[] {
  const fields = controls.filters ?? [];
  const sorts = controls.sorts ?? [];
  const q = query.trim();

  if (!q) {
    const entries: MenuEntry[] = fields.map((field) => ({ kind: "field", field }));
    if (sorts.length > 0) entries.push({ kind: "sort", sorts });
    return entries;
  }

  const entries: MenuEntry[] = fields
    .filter((field) => matchesQuery(q, [field.label]))
    .map((field) => ({ kind: "field", field }));

  for (const field of fields) {
    for (const option of field.options) {
      if (matchesQuery(q, [option.label])) entries.push({ kind: "value", field, option });
    }
  }

  if (sorts.length > 0 && (matchesQuery(q, ["sort"]) || sorts.some((s) => matchesQuery(q, [s.label])))) {
    entries.push({ kind: "sort", sorts });
  }
  return entries;
}

/** A dimension's options for the second step, narrowed by that step's own search. */
export function optionsFor(field: FilterDef, query: string): FilterOption[] {
  return field.options.filter((option) => matchesQuery(query, [option.label]));
}
