/** Hover tooltip shown to the right of a collapsed-sidebar rail item. Visibility
 *  is driven by the `.group:hover > .rail-tooltip` rule in app.css. Positioning
 *  is inline so it doesn't depend on purged utility classes. */
export function RailTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="rail-tooltip pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border-border-default border-[0.5px] bg-page px-2.5 py-1 text-body-sm font-medium text-primary-foreground shadow-default"
      style={{ left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: 10 }}
    >
      {label}
    </span>
  );
}
