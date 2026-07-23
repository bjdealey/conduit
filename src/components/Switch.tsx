/** A small on/off switch. The "on" track uses the brand accent, so it reflects
 *  the current colour theme. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="focusable relative inline-flex shrink-0 items-center rounded-full transition-colors"
      style={{
        width: 40,
        height: 22,
        background: checked ? "var(--color-brand-solid)" : "var(--color-component-active)",
      }}
    >
      <span
        className="rounded-full transition-transform"
        style={{
          width: 16,
          height: 16,
          background: "var(--color-white-fill)",
          transform: checked ? "translateX(20px)" : "translateX(2px)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}
