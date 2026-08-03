import { useEffect } from "react";
import { useStore } from "../store";
import { workspaceControls, type ActionDef } from "../data/workspaceControls";
import { FilterBar, SearchFilterField } from "./FilterBar";

function Action({ action, onSelect }: { action: ActionDef; onSelect: () => void }) {
  if (action.iconOnly) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-label={action.label}
        title={action.label}
        className="pressable focusable flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
      >
        {action.icon}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="pressable focusable inline-flex shrink-0 items-center gap-1.5 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
    >
      {action.icon}
      {action.label}
      {action.hint && (
        <kbd className="rounded bg-component px-1 font-departure-mono text-[0.65rem] text-tertiary-foreground">
          {action.hint}
        </kbd>
      )}
    </button>
  );
}

/**
 * The workspace header: one shared bar above the panes carrying the current
 * page's search, filters, sort, and actions.
 *
 * It replaces the per-pane search boxes that used to live inside each list
 * column, so the controls act on the whole workspace — the collection pane, the
 * board/grid/timeline, and the reporting tabs read the same narrowed set. What
 * each page shows is declared in `data/workspaceControls`; the state lives in the
 * store per page (so narrowing survives navigating away and back); what a filter
 * or sort *means* is applied by the page itself.
 *
 * Search and filtering are one control: the search field carries the filter glyph
 * inside its frame (<SearchFilterField>), so a filter can be typed or browsed
 * from the same box, and what's chosen reads back as chips (<FilterBar>).
 *
 * Pages that declare no controls (Settings) render no bar at all.
 */
export function WorkspaceHeader() {
  const {
    view,
    role,
    controls,
    setControlsQuery,
    setControlsFilter,
    setControlsSort,
    clearControls,
    sectionTab,
    setView,
    newWorkflow,
  } = useStore();

  const definition = workspaceControls(view, sectionTab(view));
  const state = controls(view);
  const { search, filters = [], sorts = [], actions = [] } = definition ?? {};

  // A page's controls can change with its section tab (Activity's stream tabs,
  // Manage's object tabs). Drop any selection the new set no longer offers, so a
  // filter can never keep narrowing the page from a control that isn't shown.
  useEffect(() => {
    for (const [id, value] of Object.entries(state.filters)) {
      const filter = filters.find((f) => f.id === id);
      if (!filter || !filter.options.some((o) => o.id === value.value)) setControlsFilter(view, id, null);
    }
  });

  if (!definition) return null;

  // Actions are declared per page; the ones that do something in this prototype
  // are wired here, so the descriptor stays presentation-only.
  const runAction = (id: string) => {
    if (id === "all-problems") setView("inbox");
    if (id === "new-workflow") newWorkflow();
  };

  const allowed = actions.filter((a) => !a.roles || a.roles.includes(role));

  // A page with nothing to show in the bar shouldn't render an empty rule.
  if (!search && filters.length === 0 && sorts.length === 0 && allowed.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-border-default border-b-[0.5px] px-3 py-2">
      {search && (
        <SearchFilterField
          controls={definition}
          placeholder={search}
          value={state.query}
          onChange={(q) => setControlsQuery(view, q)}
          onApply={(fieldId, value) => setControlsFilter(view, fieldId, value)}
          onSort={(sortId) => setControlsSort(view, sortId)}
        />
      )}

      <FilterBar
        controls={definition}
        state={state}
        hasSearch={Boolean(search)}
        onApply={(fieldId, value) => setControlsFilter(view, fieldId, value)}
        onOp={(fieldId, op) => setControlsFilter(view, fieldId, state.filters[fieldId]?.value ?? "", op)}
        onRemove={(fieldId) => setControlsFilter(view, fieldId, null)}
        onSort={(sortId, dir) => setControlsSort(view, sortId, dir)}
        onClear={() => clearControls(view)}
      />

      {allowed.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          {allowed.map((action) => (
            <Action key={action.id} action={action} onSelect={() => runAction(action.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
