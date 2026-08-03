/** A single headline figure: mono label, large value, optional qualifier. The
 *  KPI unit every summary pane is built from (Activity's insights, a runner's
 *  detail, a folder's contents), so the numbers read the same everywhere. */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border-border-default border-[0.5px] bg-page p-4 shadow-default">
      <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">{label}</span>
      <span className="font-sans text-heading-3 font-medium text-primary-foreground">{value}</span>
      {sub && <span className="text-body-sm text-tertiary-foreground">{sub}</span>}
    </div>
  );
}
