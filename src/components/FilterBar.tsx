import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ListFilter, Search, X } from "lucide-react";
import type { FilterDef, FilterOption, SortDef, WorkspaceControls } from "../data/workspaceControls";
import { menuEntries, optionsFor, type MenuEntry } from "../lib/filterMenu";
import {
  FILTER_OPS,
  resolveSort,
  type FilterOp,
  type FilterValue,
  type SortDir,
  type WorkspaceState,
} from "../lib/workspace";
import { Menu } from "./Menu";

/* =============================================================================
   The filter bar
   -----------------------------------------------------------------------------
   Search and filtering are one control, not two. The page's search field holds
   the filter glyph inside its own frame (<SearchFilterField>): type to search the
   rows and your text simultaneously suggests the filters and sorts it matches, or
   press the glyph to browse everything the page can be narrowed or ordered by.
   Picking a dimension drills into its values.

   What you choose comes back as a chip reading "Status is Active" — editable in
   place, removable on its own, and clearable all at once. <FilterBar> is those
   chips; it only grows a Filter button of its own on a page that declares filters
   but no search field, so there is exactly one door either way.

   The bar renders what `data/workspaceControls` declares for the page, so adding
   a filter to a page is still a matter of declaring it, never of touching this.
   ============================================================================= */

/** A value's coloured dot, so the menu and its chips carry the row's colour. */
function Dot({ accent }: { accent?: string }) {
  if (!accent) return null;
  return <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />;
}

/** The popover shell: a click-catcher behind, a `pop-in` panel in front. */
function Popover({ onDismiss, align = "left", children }: { onDismiss: () => void; align?: "left" | "right"; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <>
      <span className="fixed inset-0" style={{ zIndex: 40 }} onClick={onDismiss} />
      <div
        role="menu"
        className="pop-in absolute flex flex-col rounded-xl border-border-default border-[0.5px] bg-page"
        style={{
          zIndex: 50,
          top: "calc(100% + 6px)",
          [align]: 0,
          width: 232,
          transformOrigin: `top ${align}`,
          boxShadow: "var(--s-popover)",
        }}
      >
        {children}
      </div>
    </>
  );
}

/** The menu's own search field — the one that makes two menus feel like one. */
function MenuSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <label className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-2.5">
      <Search size={15} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
      />
    </label>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  highlighted,
  onSelect,
}: {
  icon?: ReactNode;
  label: string;
  trailing?: ReactNode;
  highlighted?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="focusable flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-transparent-hover"
      style={{ background: highlighted ? "var(--color-transparent-hover)" : undefined }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-tertiary-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{label}</span>
      {trailing}
    </button>
  );
}

/** What a menu is showing: the dimensions, or one dimension's values, or sorts. */
type Step = { kind: "fields" } | { kind: "values"; field: FilterDef } | { kind: "sort"; sorts: SortDef[] };

type Choose = {
  onDrill: (step: Step) => void;
  onApply: (fieldId: string, value: string) => void;
  onSort: (sortId: string) => void;
};

/** The rows for the current step. Shared by the Filter button's menu and the
 *  search field's suggestions, so both offer exactly the same things. */
function EntryList({
  controls,
  step,
  query,
  highlight,
  choose,
}: {
  controls: WorkspaceControls;
  step: Step;
  query: string;
  /** Index of the keyboard-highlighted row, or -1 when the pointer is leading. */
  highlight?: number;
  choose: Choose;
}) {
  const rows = stepRows(controls, step, query);

  if (rows.length === 0) {
    return <p className="px-2 py-3 text-center text-body-sm text-tertiary-foreground">Nothing matches.</p>;
  }

  return (
    <div className="flex flex-col p-1.5">
      {rows.map((row, i) => (
        <span key={row.key} className="flex flex-col">
          {row.rule && <span className="my-1 h-px w-full" style={{ background: "var(--color-border-default)" }} />}
          <MenuRow
            icon={row.icon}
            label={row.label}
            trailing={row.trailing}
            highlighted={i === highlight}
            onSelect={() => row.select(choose)}
          />
        </span>
      ))}
    </div>
  );
}

/** One rendered row, flattened from the step so the keyboard and the pointer walk
 *  the same list. */
type Row = {
  key: string;
  icon?: ReactNode;
  label: string;
  trailing?: ReactNode;
  /** Draw a separator above this row (the sort group). */
  rule?: boolean;
  select: (choose: Choose) => void;
};

function stepRows(controls: WorkspaceControls, step: Step, query: string): Row[] {
  if (step.kind === "values")
    return optionsFor(step.field, query).map((option) => ({
      key: option.id,
      icon: option.accent ? <Dot accent={option.accent} /> : step.field.icon,
      label: option.label,
      select: (choose: Choose) => choose.onApply(step.field.id, option.id),
    }));

  if (step.kind === "sort")
    return step.sorts
      .filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase()))
      .map((s) => ({
        key: s.id,
        icon: <ArrowUpDown size={14} strokeWidth={1.8} />,
        label: s.label,
        select: (choose: Choose) => choose.onSort(s.id),
      }));

  return menuEntries(controls, query).map((entry: MenuEntry, i) => {
    if (entry.kind === "field")
      return {
        key: `f-${entry.field.id}`,
        icon: entry.field.icon,
        label: entry.field.label,
        select: (choose: Choose) => choose.onDrill({ kind: "values", field: entry.field }),
      };
    if (entry.kind === "value")
      return {
        key: `v-${entry.field.id}-${entry.option.id}`,
        icon: entry.option.accent ? <Dot accent={entry.option.accent} /> : entry.field.icon,
        label: entry.option.label,
        trailing: <span className="shrink-0 text-[0.72rem] text-tertiary-foreground">{entry.field.label}</span>,
        select: (choose: Choose) => choose.onApply(entry.field.id, entry.option.id),
      };
    return {
      key: `sort-${i}`,
      icon: <ArrowUpDown size={14} strokeWidth={1.8} />,
      label: "Sort by",
      rule: true,
      select: (choose: Choose) => choose.onDrill({ kind: "sort", sorts: entry.sorts }),
    };
  });
}

/** The fallback door: a Filter button and its two-step menu, for a page that
 *  declares filters but no search field to host the glyph. */
function FilterButton({
  controls,
  compact,
  onApply,
  onSort,
}: {
  controls: WorkspaceControls;
  compact: boolean;
  onApply: (fieldId: string, value: string) => void;
  onSort: (sortId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "fields" });
  const [query, setQuery] = useState("");

  const close = () => {
    setOpen(false);
    setStep({ kind: "fields" });
    setQuery("");
  };

  const placeholder = step.kind === "values" ? step.field.label : step.kind === "sort" ? "Sort by" : "Filter…";

  return (
    <span className="relative inline-flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Filter"
        className={
          "pressable focusable inline-flex items-center gap-1.5 rounded-lg text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground " +
          (compact ? "size-7 justify-center" : "border-border-default border-[0.5px] px-2.5 py-1")
        }
      >
        <ListFilter size={compact ? 16 : 14} strokeWidth={1.8} />
        {!compact && "Filter"}
      </button>

      {open && (
        <Popover onDismiss={close}>
          <MenuSearch value={query} onChange={setQuery} placeholder={placeholder} />
          <EntryList
            controls={controls}
            step={step}
            query={query}
            choose={{
              onDrill: (next) => {
                setStep(next);
                setQuery("");
              },
              onApply: (fieldId, value) => {
                onApply(fieldId, value);
                close();
              },
              onSort: (sortId) => {
                onSort(sortId);
                close();
              },
            }}
          />
        </Popover>
      )}
    </span>
  );
}

/**
 * The search field *is* the filter control — one frame, both doors.
 *
 * Type and the text searches the rows while suggesting the filters and sorts it
 * matches, so a filter can be typed as readily as picked; taking one of those
 * suggestions clears the text, because the chip now says what the text was
 * reaching for. Or press the filter glyph inside the field to browse everything
 * the page offers, ignoring what's typed — there the text is a real search, and
 * applying a filter from the list leaves it standing.
 */
export function SearchFilterField({
  controls,
  placeholder,
  value,
  onChange,
  onApply,
  onSort,
}: {
  controls: WorkspaceControls;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onApply: (fieldId: string, value: string) => void;
  onSort: (sortId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "fields" });
  const [highlight, setHighlight] = useState(-1);
  // "suggest" follows what's typed; "browse" is the glyph's list of everything.
  const [mode, setMode] = useState<"suggest" | "browse">("suggest");
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const suggestible = (controls.filters?.length ?? 0) > 0 || (controls.sorts?.length ?? 0) > 0;
  // The typed text picks the suggestions. Browsing ignores it, and once you've
  // drilled into a dimension the text is the page's search again — so that step
  // shows all of its options either way.
  const stepQuery = step.kind === "fields" && mode === "suggest" ? value : "";
  const rows = stepRows(controls, step, stepQuery);

  // Dismiss on a click outside the field and its panel — not on blur, so a click
  // on a suggestion lands before the panel goes away.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const reset = () => {
    setOpen(false);
    setStep({ kind: "fields" });
    setHighlight(-1);
    setMode("suggest");
  };

  /** The glyph inside the field: browse everything, or close what's open. */
  const toggleBrowse = () => {
    if (open && mode === "browse") return reset();
    setStep({ kind: "fields" });
    setHighlight(-1);
    setMode("browse");
    setOpen(true);
    input.current?.focus();
  };

  // Text that led to a suggestion was navigation, not a search, so taking the
  // suggestion consumes it. Text that was merely sitting there while you browsed
  // the glyph's list is a real search — leave it alone.
  const consumeText = () => mode === "suggest" && onChange("");

  const choose: Choose = {
    onDrill: (next) => {
      setStep(next);
      setHighlight(-1);
    },
    onApply: (fieldId, v) => {
      onApply(fieldId, v);
      consumeText();
      reset();
    },
    onSort: (sortId) => {
      onSort(sortId);
      consumeText();
      reset();
    },
  };

  // Typing searches; the arrows walk the suggestions and Enter takes one. Enter
  // with nothing highlighted leaves the text alone — it's already the search.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? rows.length - 1 : h - 1));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      rows[highlight].select(choose);
    } else if (e.key === "Escape") {
      reset();
    }
  };

  return (
    <div ref={wrapper} className="relative flex min-w-0 flex-1 items-center" style={{ maxWidth: "22rem" }}>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-component py-1 pl-2.5 pr-1">
        <Search size={15} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
        <input
          ref={input}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setHighlight(-1);
            setMode("suggest");
            if (suggestible) setOpen(true);
          }}
          onFocus={() => suggestible && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
        />
        {suggestible && (
          <>
            <span aria-hidden className="h-4 w-px shrink-0" style={{ background: "var(--color-border-default)" }} />
            <button
              type="button"
              onClick={toggleBrowse}
              aria-haspopup="menu"
              aria-expanded={open && mode === "browse"}
              aria-label="Filter"
              title="Filter"
              className="focusable flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-transparent-hover"
              // Held down while its list is up, so the open panel has a visible owner.
              style={
                open && mode === "browse"
                  ? { color: "var(--color-primary-foreground)", background: "var(--color-transparent-hover)" }
                  : { color: "var(--color-tertiary-foreground)" }
              }
            >
              <ListFilter size={15} strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>

      {open && suggestible && (
        <div
          className="pop-in absolute flex flex-col rounded-xl border-border-default border-[0.5px] bg-page"
          style={{
            zIndex: 50,
            top: "calc(100% + 6px)",
            left: 0,
            width: 264,
            transformOrigin: "top left",
            boxShadow: "var(--s-popover)",
          }}
        >
          {step.kind !== "fields" && (
            <span className="border-border-default border-b-[0.5px] px-3 py-2 text-[0.72rem] text-tertiary-foreground">
              {step.kind === "values" ? step.field.label : "Sort by"}
            </span>
          )}
          <EntryList controls={controls} step={step} query={stepQuery} highlight={highlight} choose={choose} />
        </div>
      )}
    </div>
  );
}

/** An applied filter, read as a sentence: field · operator · value · remove.
 *  The operator and the value are both editable in place. */
function Chip({
  field,
  applied,
  onOp,
  onValue,
  onRemove,
}: {
  field: FilterDef;
  applied: FilterValue;
  onOp: (op: FilterOp) => void;
  onValue: (value: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const option: FilterOption | undefined = field.options.find((o) => o.id === applied.value);

  return (
    <span className="inline-flex shrink-0 items-center rounded-lg border-border-default border-[0.5px] bg-page">
      <span className="inline-flex items-center gap-1.5 py-1 pl-2 pr-1 text-body-sm text-primary-foreground">
        <span className="flex size-4 shrink-0 items-center justify-center text-tertiary-foreground">{field.icon}</span>
        {field.label}
      </span>

      <Menu
        label={applied.op}
        options={FILTER_OPS.map((op) => ({ id: op, label: op }))}
        value={applied.op}
        onChange={(op) => onOp(op as FilterOp)}
      />

      <span className="relative inline-flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="focusable inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-body-sm text-primary-foreground transition-colors hover:bg-transparent-hover"
        >
          <Dot accent={option?.accent} />
          {option?.label ?? applied.value}
        </button>
        {open && (
          <Popover onDismiss={() => setOpen(false)}>
            <div className="flex flex-col p-1.5">
              {field.options.map((o) => (
                <MenuRow
                  key={o.id}
                  icon={o.accent ? <Dot accent={o.accent} /> : field.icon}
                  label={o.label}
                  trailing={o.id === applied.value ? <Check size={15} strokeWidth={2} className="shrink-0" /> : undefined}
                  onSelect={() => {
                    onValue(o.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          </Popover>
        )}
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${field.label} filter`}
        className="focusable mr-1 flex size-5 items-center justify-center rounded text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </span>
  );
}

/** What a direction means in words. Names read alphabetically; everything else is
 *  a magnitude or a moment, where "most" and "newest" say more than "descending". */
function directionLabel(sortId: string, dir: SortDir): string {
  if (sortId === "name" || sortId === "automation" || sortId === "package")
    return dir === "asc" ? "A–Z" : "Z–A";
  if (sortId === "recent" || sortId === "id") return dir === "asc" ? "oldest" : "newest";
  return dir === "asc" ? "lowest" : "highest";
}

/** What the bar reads back: a chip per applied filter, the sort once it's been
 *  chosen (with its direction on the chip), and Clear. `hasSearch` says the page
 *  has a <SearchFilterField> carrying the filter glyph; without one, the bar
 *  grows its own Filter button so the page is still filterable. */
export function FilterBar({
  controls,
  state,
  hasSearch,
  onApply,
  onOp,
  onRemove,
  onSort,
  onClear,
}: {
  controls: WorkspaceControls;
  state: WorkspaceState;
  hasSearch: boolean;
  onApply: (fieldId: string, value: string) => void;
  onOp: (fieldId: string, op: FilterOp) => void;
  onRemove: (fieldId: string) => void;
  onSort: (sortId: string, dir?: SortDir | "") => void;
  onClear: () => void;
}) {
  const fields = controls.filters ?? [];
  const sorts = controls.sorts ?? [];
  const applied = fields
    .map((field) => ({ field, value: state.filters[field.id] }))
    .filter((entry): entry is { field: FilterDef; value: FilterValue } => entry.value !== undefined);

  // The sort shows once it's been chosen — that's when its direction becomes
  // something to flip.
  const active = resolveSort(state, sorts);
  const sort = state.sort || state.dir ? sorts.find((s) => s.id === active.id) : undefined;
  const anything = applied.length > 0 || sort !== undefined;

  if (fields.length === 0 && sorts.length === 0) return null;

  return (
    <>
      {applied.map(({ field, value }) => (
        <Chip
          key={field.id}
          field={field}
          applied={value}
          onOp={(op) => onOp(field.id, op)}
          onValue={(next) => onApply(field.id, next)}
          onRemove={() => onRemove(field.id)}
        />
      ))}

      {sort && (
        <span className="inline-flex shrink-0 items-center rounded-lg border-border-default border-[0.5px] bg-page">
          <span className="inline-flex items-center gap-1.5 py-1 pl-2 pr-1 text-body-sm text-primary-foreground">
            <ArrowUpDown size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
            <span className="text-tertiary-foreground">Sort</span>
            {sort.label}
          </span>

          {/* The direction is the arrow itself: click it to flip, and it always
              points the way the rows currently read. */}
          <button
            type="button"
            onClick={() => onSort(active.id, active.dir === "asc" ? "desc" : "asc")}
            aria-label={active.dir === "asc" ? "Sort descending" : "Sort ascending"}
            title={active.dir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
            className="focusable inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            {active.dir === "asc" ? <ArrowUp size={13} strokeWidth={2} /> : <ArrowDown size={13} strokeWidth={2} />}
            <span className="text-[0.72rem]">{directionLabel(sort.id, active.dir)}</span>
          </button>

          <button
            type="button"
            onClick={() => onSort("", "")}
            aria-label="Reset sort"
            className="focusable mr-1 flex size-5 items-center justify-center rounded text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </span>
      )}

      {anything && (
        <button
          type="button"
          onClick={onClear}
          className="pressable focusable shrink-0 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
        >
          Clear
        </button>
      )}

      {!hasSearch && <FilterButton controls={controls} compact={anything} onApply={onApply} onSort={onSort} />}
    </>
  );
}
