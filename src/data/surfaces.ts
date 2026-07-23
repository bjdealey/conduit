/** Monitored surfaces (deployed apps/endpoints Conduit watches). The Surfaces
 *  view renders a surface "dashboard": status, integrations, latest release, and
 *  an events-over-time chart with a 10-minute-bucket log. */

export type Integration = {
  kind: "github" | "cloudflare";
  title: string;
  subtitle: string;
};

export type Release = {
  id: string;
  environment: string;
  status: string;
  createdAgo: string;
  deployedAgo: string;
  source: string;
  destination: string;
  sourceFiles: number;
  sourceMaps: number;
  coverage: string;
};

export type LogRow = { time: string; count: number };

export type Surface = {
  id: string;
  name: string;
  /** Health line, e.g. "No Events in last 10m". */
  status: string;
  statusTone: "ok" | "warn" | "error";
  stack: string;
  dataResidency: string;
  dataResidencyFlag: string;
  createdAgo: string;
  integrations: Integration[];
  release: Release;
  /** Recent 10-minute buckets (newest first) for the log table. */
  log: LogRow[];
};

export const surfaces: Surface[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    status: "No Events in last 10m",
    statusTone: "warn",
    stack: "Vite",
    dataResidency: "US",
    dataResidencyFlag: "🇺🇸",
    createdAgo: "13 days ago",
    integrations: [
      { kind: "github", title: "conduit/conduit", subtitle: "src/frontend/app" },
      { kind: "cloudflare", title: "app-production", subtitle: "Cloudflare Workers" },
    ],
    release: {
      id: "rel_19b94efe85fc3eac",
      environment: "Production",
      status: "Deployed",
      createdAgo: "an hour ago",
      deployedAgo: "an hour ago",
      source: "main",
      destination: "app-production",
      sourceFiles: 356,
      sourceMaps: 356,
      coverage: "100% coverage",
    },
    log: [
      { time: "02:50:00 AM", count: 58 },
      { time: "02:40:00 AM", count: 3 },
      { time: "02:30:00 AM", count: 5 },
      { time: "02:20:00 AM", count: 83 },
      { time: "02:10:00 AM", count: 4 },
      { time: "02:00:00 AM", count: 3 },
      { time: "01:50:00 AM", count: 3 },
      { time: "01:40:00 AM", count: 4 },
      { time: "01:30:00 AM", count: 4 },
      { time: "01:20:00 AM", count: 3 },
      { time: "01:10:00 AM", count: 6 },
      { time: "01:00:00 AM", count: 4 },
      { time: "12:50:00 AM", count: 4 },
      { time: "12:40:00 AM", count: 5 },
      { time: "12:30:00 AM", count: 7 },
      { time: "12:20:00 AM", count: 4 },
    ],
  },
];
