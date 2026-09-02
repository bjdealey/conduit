import { useEffect, useMemo } from "react";
import { useStore } from "../store";
import { workspaceControls, type ActionDef } from "../data/workspaceControls";
import { platformsIn } from "../data/types";
import { FilterBar, SearchFilterField } from "./FilterBar";

/** Action ids `runAction` below actually does something for.
 *
 *  The descriptors in `data/workspaceControls` declare what a page *will* offer;
 *  this is what it can do today. The two must be allowed to differ — the roadmap
 *  surfaces (Manage, Administration, Surfaces) are shaped before they're wired,
 *  and that's the point of the readiness chip. What they must not do is differ
 *  *silently*: "New" on Manage, "Invite" on Administration and "Surface options"
 *  all rendered as ordinary live buttons and swallowed the click, which reads as a
 *  broken page rather than an unbuilt one. Unwired actions are drawn inert and say
 *  so on hover instead. Wiring one is deleting a line here. */
const WIRED = new Set(["all-problems", "new-workflow"]);

function Action({ action, onSelect }: { action: ActionDef; onSelect: () => void }) {
  const wired = WIRED.has(action.id);
  // A disabled control gets no hover title in most browsers, so the explanation
  // rides on a wrapper that still receives pointer events.
  const title = wired ? action.label : `${action.label} — not built yet on this surface`;
  // `disabled:opacity-45` is one of the two disabled utilities this stylesheet
  // actually defines (app.css) — there is no Tailwind here to generate a bare
  // `opacity-45`, and no `cursor-not-allowed` at all, so the cursor is inline.
  const dim = wired ? "" : " disabled:opacity-45";
  const style = wired ? undefined : { cursor: "not-allowed" as const };

  if (action.iconOnly) {
    return (
      <span title={title} className="flex shrink-0">
        <button
          type="button"
          onClick={onSelect}
          disabled={!wired}
          style={style}
          aria-label={title}
          className={
            "pressable focusable flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground" +
            dim
          }
        >
          {action.icon}
        </button>
      </span>
    );
  }
  return (
    <span title={title} className="flex shrink-0">
      <button
        type="button"
        onClick={onSelect}
        disabled={!wired}
        style={style}
        aria-label={wired ? undefined : title}
        className={
          "pressable focusable inline-flex shrink-0 items-center gap-1.5 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground" +
          dim
        }
      >
        {action.icon}
        {action.label}
        {action.hint && (
          <kbd className="rounded bg-component px-1 font-departure-mono text-[0.65rem] text-tertiary-foreground">
            {action.hint}
          </kbd>
        )}
      </button>
    </span>
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
    section,
    role,
    controls,
    setControlsQuery,
    setControlsFilter,
    setControlsSort,
    clearControls,
    sectionTab,
    newWorkflow,
    selectedFolderId,
    selectedWorkflowId,
    selectedFileId,
    workflows,
    files,
  } = useStore();

  // The option sets a filter can only read off the rows on screen. Derived here
  // rather than listed in the descriptor, so a menu never offers a platform
  // nobody has connected.
  const facets = useMemo(() => ({ platforms: platformsIn(workflows) }), [workflows]);

  const definition = workspaceControls(section, sectionTab(section), facets);
  const state = controls(section);
  const { search, filters = [], sorts = [], actions = [] } = definition ?? {};

  // A page's controls can change with its tab (Activity's stream tabs,
  // Administration's object tabs). Drop any selection the new set no longer
  // offers, so a filter can never keep narrowing the page from a control that
  // isn't shown.
  useEffect(() => {
    for (const [id, value] of Object.entries(state.filters)) {
      const filter = filters.find((f) => f.id === id);
      if (!filter || !filter.options.some((o) => o.id === value.value)) setControlsFilter(section, id, null);
    }
  });

  if (!definition) return null;

  // Actions are declared per page; the ones that do something in this prototype
  // are wired here, so the descriptor stays presentation-only.
  const runAction = (id: string) => {
    // New work lands where the library is open — the folder itself, or the folder
    // holding whatever is open in it. Creating always into Drafts made sense when
    // folders weren't destinations; now it just files things away from you.
    if (id === "new-workflow") {
      const home =
        selectedFolderId ??
        workflows.find((w) => w.id === selectedWorkflowId)?.folderId ??
        files.find((f) => f.id === selectedFileId)?.folderId;
      newWorkflow(home ?? undefined);
    }
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
          onChange={(q) => setControlsQuery(section, q)}
          onApply={(fieldId, value) => setControlsFilter(section, fieldId, value)}
          onSort={(sortId) => setControlsSort(section, sortId)}
        />
      )}

      <FilterBar
        controls={definition}
        state={state}
        hasSearch={Boolean(search)}
        onApply={(fieldId, value) => setControlsFilter(section, fieldId, value)}
        onOp={(fieldId, op) => setControlsFilter(section, fieldId, state.filters[fieldId]?.value ?? "", op)}
        onRemove={(fieldId) => setControlsFilter(section, fieldId, null)}
        onSort={(sortId, dir) => setControlsSort(section, sortId, dir)}
        onClear={() => clearControls(section)}
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
