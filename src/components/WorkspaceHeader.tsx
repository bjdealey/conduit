import { useEffect } from "react";
import { Search } from "lucide-react";
import { useStore } from "../store";
import { workspaceControls, type ActionDef } from "../data/workspaceControls";
import { FilterBar } from "./FilterBar";

/** The page's search field. Capped in width so the bar keeps room for the filters
 *  and stays legible on a wide workspace. */
function SearchField({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <label
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-component px-2.5 py-1.5"
      style={{ maxWidth: "20rem" }}
    >
      <Search size={15} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
      />
    </label>
  );
}

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
 * The search field stands on its own; filters and sort live behind one Filter
 * button (<FilterBar>) that opens a searchable menu of everything the page can be
 * narrowed or ordered by, and reads back as chips.
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
    newAutomation,
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
    if (id === "new-automation") newAutomation();
  };

  const allowed = actions.filter((a) => !a.roles || a.roles.includes(role));

  // A page with nothing to show in the bar shouldn't render an empty rule.
  if (!search && filters.length === 0 && sorts.length === 0 && allowed.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-border-default border-b-[0.5px] px-3 py-2">
      {search && (
        <SearchField placeholder={search} value={state.query} onChange={(q) => setControlsQuery(view, q)} />
      )}

      <FilterBar
        controls={definition}
        state={state}
        onApply={(fieldId, value) => setControlsFilter(view, fieldId, value)}
        onOp={(fieldId, op) => setControlsFilter(view, fieldId, state.filters[fieldId]?.value ?? "", op)}
        onRemove={(fieldId) => setControlsFilter(view, fieldId, null)}
        onSort={(sortId) => setControlsSort(view, sortId)}
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
