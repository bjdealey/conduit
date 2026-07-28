import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpDown, Check, ListFilter, Search, X } from "lucide-react";
import type { FilterDef, FilterOption, SortDef, WorkspaceControls } from "../data/workspaceControls";
import { menuEntries, optionsFor } from "../lib/filterMenu";
import { FILTER_OPS, type FilterOp, type FilterValue, type WorkspaceState } from "../lib/workspace";
import { Menu } from "./Menu";

/* =============================================================================
   The filter bar
   -----------------------------------------------------------------------------
   One Filter button instead of a control per dimension. It opens a searchable
   menu of everything the page can be narrowed or ordered by; picking a dimension
   drills into its values, and what you choose comes back as a chip that reads
   "Status is Active" — editable in place, removable on its own, and clearable all
   at once.

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
          boxShadow: "0 12px 32px -8px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.04)",
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
  onSelect,
}: {
  icon?: ReactNode;
  label: string;
  trailing?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="focusable flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-transparent-hover"
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-tertiary-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{label}</span>
      {trailing}
    </button>
  );
}

/** What the menu is showing: the dimensions, or one dimension's values. */
type Step = { kind: "fields" } | { kind: "values"; field: FilterDef } | { kind: "sort"; sorts: SortDef[] };

/** The Filter button and its two-step menu. */
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
  const drill = (next: Step) => {
    setStep(next);
    setQuery("");
  };

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
          {step.kind === "fields" && (
            <>
              <MenuSearch value={query} onChange={setQuery} placeholder="Filter…" />
              <div className="flex flex-col p-1.5">
                {menuEntries(controls, query).map((entry, i) => {
                  if (entry.kind === "field")
                    return (
                      <MenuRow
                        key={`f-${entry.field.id}`}
                        icon={entry.field.icon}
                        label={entry.field.label}
                        onSelect={() => drill({ kind: "values", field: entry.field })}
                      />
                    );
                  if (entry.kind === "value")
                    return (
                      <MenuRow
                        key={`v-${entry.field.id}-${entry.option.id}`}
                        icon={entry.option.accent ? <Dot accent={entry.option.accent} /> : entry.field.icon}
                        label={entry.option.label}
                        trailing={
                          <span className="shrink-0 text-[0.72rem] text-tertiary-foreground">{entry.field.label}</span>
                        }
                        onSelect={() => {
                          onApply(entry.field.id, entry.option.id);
                          close();
                        }}
                      />
                    );
                  return (
                    <span key={`s-${i}`} className="flex flex-col">
                      <span className="my-1 h-px w-full" style={{ background: "var(--color-border-default)" }} />
                      <MenuRow
                        icon={<ArrowUpDown size={14} strokeWidth={1.8} />}
                        label="Sort by"
                        onSelect={() => drill({ kind: "sort", sorts: entry.sorts })}
                      />
                    </span>
                  );
                })}
                {menuEntries(controls, query).length === 0 && (
                  <p className="px-2 py-3 text-center text-body-sm text-tertiary-foreground">Nothing matches.</p>
                )}
              </div>
            </>
          )}

          {step.kind === "values" && (
            <>
              <MenuSearch value={query} onChange={setQuery} placeholder={step.field.label} />
              <div className="flex flex-col p-1.5">
                {optionsFor(step.field, query).map((option) => (
                  <MenuRow
                    key={option.id}
                    icon={option.accent ? <Dot accent={option.accent} /> : step.field.icon}
                    label={option.label}
                    onSelect={() => {
                      onApply(step.field.id, option.id);
                      close();
                    }}
                  />
                ))}
                {optionsFor(step.field, query).length === 0 && (
                  <p className="px-2 py-3 text-center text-body-sm text-tertiary-foreground">Nothing matches.</p>
                )}
              </div>
            </>
          )}

          {step.kind === "sort" && (
            <>
              <MenuSearch value={query} onChange={setQuery} placeholder="Sort by" />
              <div className="flex flex-col p-1.5">
                {step.sorts
                  .filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase()))
                  .map((s) => (
                    <MenuRow
                      key={s.id}
                      icon={<ArrowUpDown size={14} strokeWidth={1.8} />}
                      label={s.label}
                      onSelect={() => {
                        onSort(s.id);
                        close();
                      }}
                    />
                  ))}
              </div>
            </>
          )}
        </Popover>
      )}
    </span>
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

/** The whole bar: a chip per applied filter, the sort when it isn't the default,
 *  Clear, and the Filter button (which shrinks to its icon once chips are up). */
export function FilterBar({
  controls,
  state,
  onApply,
  onOp,
  onRemove,
  onSort,
  onClear,
}: {
  controls: WorkspaceControls;
  state: WorkspaceState;
  onApply: (fieldId: string, value: string) => void;
  onOp: (fieldId: string, op: FilterOp) => void;
  onRemove: (fieldId: string) => void;
  onSort: (sortId: string) => void;
  onClear: () => void;
}) {
  const fields = controls.filters ?? [];
  const sorts = controls.sorts ?? [];
  const applied = fields
    .map((field) => ({ field, value: state.filters[field.id] }))
    .filter((entry): entry is { field: FilterDef; value: FilterValue } => entry.value !== undefined);

  const sort = sorts.find((s) => s.id === state.sort);
  const showSort = sort !== undefined && sort.id !== sorts[0]?.id;
  const anything = applied.length > 0 || showSort;

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

      {showSort && (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-border-default border-[0.5px] py-1 pl-2 pr-1 text-body-sm">
          <ArrowUpDown size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
          <span className="text-tertiary-foreground">Sort</span>
          <span className="text-primary-foreground">{sort.label}</span>
          <button
            type="button"
            onClick={() => onSort(sorts[0].id)}
            aria-label="Reset sort"
            className="focusable flex size-5 items-center justify-center rounded text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
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

      <FilterButton controls={controls} compact={anything} onApply={onApply} onSort={onSort} />
    </>
  );
}
