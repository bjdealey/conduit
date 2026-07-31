import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/** One choice in a menu. */
export type MenuOption = { id: string; label: string };

/**
 * A small single-select dropdown over a `pop-in` panel of radio items — the
 * operator on a filter chip ("is" / "is not"). It sits inside another control, so
 * it carries no frame of its own; the richer two-step menus behind the Filter
 * button live in <FilterBar>.
 */
export function Menu({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: MenuOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="relative inline-flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="focusable inline-flex items-center rounded-md px-1.5 py-1 text-body-sm text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
      >
        {label}
      </button>

      {open && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 40 }} onClick={close} />
          <span
            role="menu"
            className="pop-in absolute flex flex-col rounded-xl border-border-default border-[0.5px] bg-page p-1.5"
            style={{
              zIndex: 50,
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 120,
              transformOrigin: "top left",
              boxShadow: "var(--s-popover)",
            }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={o.id === value}
                onClick={() => {
                  onChange(o.id);
                  close();
                }}
                className="focusable flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-transparent-hover"
              >
                <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{o.label}</span>
                {o.id === value && <Check size={15} strokeWidth={2} className="shrink-0 text-primary-foreground" />}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
