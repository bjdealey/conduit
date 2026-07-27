/* =============================================================================
   Workspace control state
   -----------------------------------------------------------------------------
   Every page's search, filters, and sort live in one shared bar above the panes
   (<WorkspaceHeader>), not inside a list pane — so the controls act on the whole
   workspace: the collection pane, the board/grid/timeline, the detail, and the
   reporting tabs alike.

   This module holds the state shape and the generic helpers. What the bar renders
   per page is declared in `src/data/workspaceControls.tsx`; what a filter or sort
   *means* stays with the page that owns the data.
   ============================================================================= */

/** One page's live control state. `filters` is keyed by filter id; a missing key
 *  means "All". An empty `sort` means the page's first (default) sort. */
export type WorkspaceState = {
  query: string;
  filters: Record<string, string>;
  sort: string;
};

export const EMPTY_WORKSPACE: WorkspaceState = { query: "", filters: {}, sort: "" };

/** Case-insensitive "does any field contain the query". An empty query matches
 *  everything; nullish fields are skipped. */
export function matchesQuery(query: string, fields: (string | number | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}

/** The chosen option for a filter, or null when it's unset ("All"). */
export function filterValue(state: WorkspaceState, filterId: string): string | null {
  return state.filters[filterId] ?? null;
}

/** A filter passes when it's unset, or when the row's value matches it. */
export function passesFilter(state: WorkspaceState, filterId: string, value: string): boolean {
  const selected = state.filters[filterId];
  return selected === undefined || selected === value;
}

/** The effective sort id: what's chosen, else the page's default (first declared). */
export function activeSort(state: WorkspaceState, fallback: string): string {
  return state.sort || fallback;
}

/** Whether the page is narrowed — drives the "Clear" affordance and the wording of
 *  empty states ("nothing here" vs "nothing matches"). */
export function isNarrowed(state: WorkspaceState): boolean {
  return state.query.trim().length > 0 || Object.keys(state.filters).length > 0;
}
