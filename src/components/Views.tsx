import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { Switch } from "./Switch";
import { num } from "../lib/format";

// The page title now lives in the app breadcrumb titlebar, so each view renders
// just its scrollable body.

/** Activity — a small derived feed of recent problem events. */
export function ActivityView() {
  const { issues, memberById, select, setView } = useStore();
  const feed = issues
    .flatMap((issue) =>
      issue.activity.slice(0, 1).map((ev) => ({ issue, ev })),
    )
    .slice(0, 8);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="scrollbar-none flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-1">
          {feed.map(({ issue, ev }) => {
            const member = memberById(issue.assigneeId);
            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => {
                  select(issue.id);
                  setView("inbox");
                }}
                className="focusable flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-transparent-hover"
              >
                {member && <Avatar member={member} size={24} />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-sm text-primary-foreground">
                    <span className="font-medium">#{issue.id}</span> {ev.title}
                  </span>
                  <span className="truncate text-body-sm text-tertiary-foreground">{issue.title}</span>
                </div>
                <span className="shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">{ev.time}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Settings — appearance controls + workspace info. */
export function SettingsView() {
  const { issues, workspace, backgroundEnabled, setBackgroundEnabled, bordersEnabled, setBordersEnabled, palettes, palette, setPaletteId } = useStore();

  const infoRows = [
    { label: "Workspace", value: workspace.name },
    { label: "Total issues", value: num(issues.length) },
    { label: "Total impacted users", value: num(issues.reduce((s, i) => s + i.impactedUsers, 0)) },
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="scrollbar-none flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-8">
          {/* Appearance */}
          <section className="flex flex-col">
            <h2 className="mb-3 text-body-base font-medium text-primary-foreground">Appearance</h2>

            <div className="flex items-center justify-between gap-4 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-body-sm text-primary-foreground">Animated background</span>
                <span className="text-body-sm text-tertiary-foreground">Show the gradient behind the app.</span>
              </div>
              <Switch checked={backgroundEnabled} onChange={setBackgroundEnabled} label="Animated background" />
            </div>

            <div className="flex items-center justify-between gap-4 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-body-sm text-primary-foreground">Borders</span>
                <span className="text-body-sm text-tertiary-foreground">Outline navigation items with a hairline border.</span>
              </div>
              <Switch checked={bordersEnabled} onChange={setBordersEnabled} label="Borders" />
            </div>

            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col">
                <span className="text-body-sm text-primary-foreground">Colour theme</span>
                <span className="text-body-sm text-tertiary-foreground">Sets the accent and background colours.</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {palettes.map((p) => {
                  const active = p.id === palette.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaletteId(p.id)}
                      aria-pressed={active}
                      className="focusable flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors"
                      style={{
                        outline: active
                          ? "2px solid var(--color-brand-border-focus)"
                          : "0.5px solid var(--color-border-default)",
                        outlineOffset: active ? 1 : 0,
                      }}
                    >
                      <span
                        className="rounded-lg"
                        style={{
                          width: 60,
                          height: 38,
                          background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]} 55%, ${p.gradient[2]})`,
                        }}
                      />
                      <span
                        className="text-body-sm"
                        style={{ color: active ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)" }}
                      >
                        {p.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Workspace */}
          <section className="flex flex-col">
            <h2 className="mb-1 text-body-base font-medium text-primary-foreground">Workspace</h2>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--color-border-default)" }}>
              {infoRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between py-3">
                  <span className="text-body-sm text-tertiary-foreground">{r.label}</span>
                  <span className="text-body-sm text-primary-foreground">{r.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
