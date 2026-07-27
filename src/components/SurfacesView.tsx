import { useState, type ReactNode } from "react";
import { ChevronDown, Cloud, Files, GitBranch, Map, Zap } from "lucide-react";
import { useStore } from "../store";
import { surfaces, type Integration, type Surface } from "../data/surfaces";
import { SurfaceChart } from "./SurfaceChart";
import { SplitView, DetailPane, ContextPane } from "./layout/SplitView";
import { SegmentedControl } from "./SegmentedControl";
import { isNarrowed, matchesQuery } from "../lib/workspace";

const GithubMark = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.75.81 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.08.78 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

const STATUS_COLOR: Record<Surface["statusTone"], string> = {
  ok: "var(--grass-11)",
  warn: "var(--amber-11)",
  error: "var(--tomato-11)",
};
const STATUS_DOT: Record<Surface["statusTone"], string> = {
  ok: "var(--grass-9)",
  warn: "var(--amber-9)",
  error: "var(--tomato-9)",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

function IntegrationRow({ integration }: { integration: Integration }) {
  const icon = integration.kind === "github" ? GithubMark : <Cloud size={16} strokeWidth={1.8} />;
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-component text-secondary-foreground">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-body-sm font-medium text-primary-foreground">{integration.title}</span>
        <span className="truncate text-[0.72rem] text-tertiary-foreground">{integration.subtitle}</span>
      </div>
      <button
        type="button"
        className="pressable focusable rounded-md bg-component px-2.5 py-1 text-body-sm font-medium text-secondary-foreground transition-colors hover:text-primary-foreground"
      >
        Edit
      </button>
      <button type="button" className="focusable rounded-md px-1.5 py-1 text-body-sm text-tertiary-foreground transition-colors hover:text-primary-foreground">
        View
      </button>
    </div>
  );
}

function InfoPane({ surface }: { surface: Surface }) {
  const r = surface.release;
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-4">
        <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{surface.name}</h2>
        <div className="flex flex-col gap-1">
          <Row label="Status">
            <span className="inline-flex items-center gap-2" style={{ color: STATUS_COLOR[surface.statusTone] }}>
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: STATUS_DOT[surface.statusTone] }} />
              {surface.status}
            </span>
          </Row>
          <Row label="Stack">
            <span className="inline-flex items-center gap-2">
              <Zap size={15} strokeWidth={2} style={{ color: "var(--amber-9)" }} />
              {surface.stack}
            </span>
          </Row>
          <Row label="Data residency">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden>{surface.dataResidencyFlag}</span>
              {surface.dataResidency}
            </span>
          </Row>
          <Row label="Created">
            <span>{surface.createdAgo}</span>
          </Row>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-body-base font-medium text-primary-foreground">Integrations</h3>
        {surface.integrations.map((i) => (
          <IntegrationRow key={i.title} integration={i} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="mb-2 text-body-base font-medium text-primary-foreground">Latest release</h3>
        <Row label="Release">
          <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{r.id}</span>
        </Row>
        <Row label="Environment">
          <span>{r.environment}</span>
        </Row>
        <Row label="Status">
          <span>{r.status}</span>
        </Row>
        <Row label="Created">
          <span>{r.createdAgo}</span>
        </Row>
        <Row label="Deployed">
          <span>{r.deployedAgo}</span>
        </Row>
        <Row label="Source">
          <span className="inline-flex items-center gap-2 font-departure-mono text-[0.72rem]">
            <GitBranch size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
            {r.source}
          </span>
        </Row>
        <Row label="Destination">
          <span className="inline-flex items-center gap-2">
            <Cloud size={14} strokeWidth={1.8} style={{ color: "var(--amber-9)" }} />
            {r.destination}
          </span>
        </Row>
        <Row label="Source files">
          <span className="inline-flex items-center gap-2">
            <Files size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
            {r.sourceFiles}
          </span>
        </Row>
        <Row label="Source maps">
          <span className="inline-flex items-center gap-2">
            <Map size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
            {r.sourceMaps}
          </span>
          <span className="ml-auto text-body-sm text-tertiary-foreground">{r.coverage}</span>
        </Row>
      </div>
    </div>
  );
}

const SURFACE_TABS = ["Events", "Keys", "Environments", "Releases"] as const;
type SurfaceTab = (typeof SURFACE_TABS)[number];

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="text-body-base font-medium text-secondary-foreground">{label}</span>
      <span className="text-body-sm text-tertiary-foreground">Nothing to show in this prototype tab yet.</span>
    </div>
  );
}

function Detail({ surface }: { surface: Surface }) {
  const { controls } = useStore();
  const [tab, setTab] = useState<SurfaceTab>("Events");
  // The workspace header's search narrows the event log.
  const state = controls("surfaces");
  const log = surface.log.filter((row) => matchesQuery(state.query, [row.time, row.count]));
  return (
    <DetailPane>
      <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
        <SegmentedControl
          variant="ghost"
          ariaLabel="Surface detail"
          segments={SURFACE_TABS.map((t) => ({ id: t, label: t }))}
          value={tab}
          onChange={(id) => setTab(id as SurfaceTab)}
        />
        <button
          type="button"
          className="pressable focusable ml-auto inline-flex items-center gap-1.5 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover"
        >
          All environments
          <ChevronDown size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
        </button>
      </div>

      {tab === "Events" ? (
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
          <SurfaceChart seed={surface.id.length + surface.log.length} />

          <div className="mt-6 flex flex-col">
            <div className="flex items-center gap-6 border-border-default border-b-[0.5px] pb-2">
              <span className="w-28 shrink-0 font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
                Timestamp
              </span>
              <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
                Description
              </span>
            </div>
            {log.length === 0 && (
              <p className="py-10 text-center text-body-sm text-tertiary-foreground">
                {isNarrowed(state) ? "No events match the current search." : "No events recorded."}
              </p>
            )}
            {log.map((row) => (
              <div key={row.time} className="flex items-center gap-6 border-border-default border-b-[0.5px] py-2.5">
                <span className="w-28 shrink-0 font-departure-mono text-[0.72rem] text-tertiary-foreground">{row.time}</span>
                <span className="text-body-sm text-secondary-foreground">
                  Received <span className="text-primary-foreground">{row.count}</span> events in this 10 minute bucket
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState label={tab} />
      )}
    </DetailPane>
  );
}

/** Surfaces — a monitored surface dashboard (renamed from Projects). The event
 *  detail is the primary pane; the surface overview + latest release ride in the
 *  shared, collapsible context pane. */
export function SurfacesView() {
  const surface = surfaces[0];
  return (
    <SplitView>
      <Detail surface={surface} />
      <ContextPane>
        <InfoPane surface={surface} />
      </ContextPane>
    </SplitView>
  );
}
