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

/** How a filter compares: `is` keeps matches, `is not` keeps everything else. */
export const FILTER_OPS = ["is", "is not"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** One applied filter: the chosen option, and how it's compared. */
export type FilterValue = { op: FilterOp; value: string };

/** Which way a sort runs. Every comparator is written ascending; the direction
 *  flips it, so "Impacted users" and "Priority" need one comparator, not two. */
export type SortDir = "asc" | "desc";

/** One page's live control state. `filters` is keyed by filter id; a missing key
 *  means the filter isn't applied. An empty `sort` means the page's first
 *  (default) sort, and an empty `dir` means that sort's own default direction. */
export type WorkspaceState = {
  query: string;
  filters: Record<string, FilterValue>;
  sort: string;
  dir: SortDir | "";
};

export const EMPTY_WORKSPACE: WorkspaceState = { query: "", filters: {}, sort: "", dir: "" };

/** Case-insensitive "does any field contain the query". An empty query matches
 *  everything; nullish fields are skipped. */
export function matchesQuery(query: string, fields: (string | number | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}

/** The applied filter, or null when it isn't set. */
export function filterValue(state: WorkspaceState, filterId: string): FilterValue | null {
  return state.filters[filterId] ?? null;
}

/** A row passes when the filter isn't applied, or when its value matches the
 *  filter under that filter's operator. */
export function passesFilter(state: WorkspaceState, filterId: string, value: string): boolean {
  const applied = state.filters[filterId];
  if (applied === undefined) return true;
  return applied.op === "is not" ? value !== applied.value : value === applied.value;
}

/** The applied filters as entries, in the order they were added. */
export function activeFilters(state: WorkspaceState): { id: string; filter: FilterValue }[] {
  return Object.entries(state.filters).map(([id, filter]) => ({ id, filter }));
}

/**
 * The sort in effect: the chosen one, else the page's first; and its direction,
 * which is whatever the reader picked, else that sort's own default (names read
 * A→Z, magnitudes read biggest-first).
 */
export function resolveSort(
  state: WorkspaceState,
  sorts: { id: string; defaultDir?: SortDir }[],
): { id: string; dir: SortDir } {
  const id = state.sort || sorts[0]?.id || "";
  const dir = state.dir || sorts.find((s) => s.id === id)?.defaultDir || "asc";
  return { id, dir };
}

/** Sort by an ascending comparator, flipped when the direction is descending.
 *  Equal rows keep their original order either way. */
export function ordered<T>(rows: T[], dir: SortDir, compare: (a: T, b: T) => number): T[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * compare(a, b));
}

/** Whether the page is narrowed — drives the "Clear" affordance and the wording of
 *  empty states ("nothing here" vs "nothing matches"). */
export function isNarrowed(state: WorkspaceState): boolean {
  return state.query.trim().length > 0 || Object.keys(state.filters).length > 0;
}
