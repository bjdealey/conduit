/** Deployment environments a surface ships to. Surfaced under the Environments
 *  nav item as a set of status cards. */

export type Environment = {
  id: string;
  name: string;
  status: "Healthy" | "Building" | "Degraded";
  statusTone: "ok" | "warn" | "error";
  region: string;
  regionFlag: string;
  branch: string;
  url: string;
  release: string;
  deployedAgo: string;
  surfaces: number;
  eventsPerMin: number;
};

export const environments: Environment[] = [
  {
    id: "production",
    name: "Production",
    status: "Healthy",
    statusTone: "ok",
    region: "US",
    regionFlag: "🇺🇸",
    branch: "main",
    url: "app.conduit.com",
    release: "rel_19b94efe85fc3eac",
    deployedAgo: "an hour ago",
    surfaces: 4,
    eventsPerMin: 128,
  },
  {
    id: "staging",
    name: "Staging",
    status: "Healthy",
    statusTone: "ok",
    region: "US",
    regionFlag: "🇺🇸",
    branch: "develop",
    url: "staging.conduit.com",
    release: "rel_7c31aa02de91b4c8",
    deployedAgo: "3 hours ago",
    surfaces: 4,
    eventsPerMin: 42,
  },
  {
    id: "preview",
    name: "Preview",
    status: "Building",
    statusTone: "warn",
    region: "EU",
    regionFlag: "🇪🇺",
    branch: "feature/reset-fix",
    url: "pr-1284.conduit.dev",
    release: "rel_a90f13cc74e0aa21",
    deployedAgo: "12 minutes ago",
    surfaces: 2,
    eventsPerMin: 6,
  },
  {
    id: "development",
    name: "Development",
    status: "Degraded",
    statusTone: "error",
    region: "US",
    regionFlag: "🇺🇸",
    branch: "local",
    url: "localhost:5173",
    release: "rel_local_dev",
    deployedAgo: "1 day ago",
    surfaces: 1,
    eventsPerMin: 0,
  },
];
