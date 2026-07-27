import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/** One choice in a menu. */
export type MenuOption = { id: string; label: string };

/**
 * A small single-select dropdown: a hairline trigger that names the dimension
 * (or the chosen option) over a `pop-in` panel of radio items. Shared by the
 * workspace header's filter and sort controls, so every page's menus behave —
 * and dismiss — identically.
 *
 * `clearLabel` adds a leading "clear" option (the header's implicit "All"), which
 * reports `null`. `trailing` renders inside the control's frame but outside the
 * trigger button, so callers can add an inline clear affordance without nesting
 * buttons.
 */
export function Menu({
  label,
  icon,
  options,
  value,
  onChange,
  clearLabel,
  trailing,
  align = "left",
}: {
  label: string;
  icon?: ReactNode;
  options: MenuOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  clearLabel?: string;
  trailing?: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = value === null ? null : options.find((o) => o.id === value) ?? null;
  const active = selected !== null;

  return (
    <span
      ref={wrapper}
      className="relative inline-flex shrink-0 items-center rounded-lg border-border-default border-[0.5px]"
      style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="focusable inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-body-sm transition-colors hover:bg-transparent-hover"
        style={{ color: active ? "var(--color-primary-foreground)" : "var(--color-secondary-foreground)" }}
      >
        {icon}
        {selected ? (
          <>
            <span className="text-tertiary-foreground">{label}</span>
            {selected.label}
          </>
        ) : (
          label
        )}
        <ChevronDown size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      </button>
      {trailing}

      {open && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 40 }} onClick={close} />
          <span
            role="menu"
            className="pop-in absolute flex flex-col rounded-xl border-border-default border-[0.5px] bg-page p-1.5"
            style={{
              zIndex: 50,
              top: "calc(100% + 6px)",
              [align]: 0,
              minWidth: 176,
              transformOrigin: `top ${align}`,
              boxShadow: "0 12px 32px -8px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.04)",
            }}
          >
            {clearLabel && (
              <MenuItem
                label={clearLabel}
                checked={!active}
                onSelect={() => {
                  onChange(null);
                  close();
                }}
              />
            )}
            {options.map((o) => (
              <MenuItem
                key={o.id}
                label={o.label}
                checked={o.id === value}
                onSelect={() => {
                  onChange(o.id);
                  close();
                }}
              />
            ))}
          </span>
        </>
      )}
    </span>
  );
}

function MenuItem({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className="focusable flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-transparent-hover"
    >
      <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{label}</span>
      {checked && <Check size={15} strokeWidth={2} className="shrink-0 text-primary-foreground" />}
    </button>
  );
}
