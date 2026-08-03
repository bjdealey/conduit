/**
 * The runner pool — the execution capacity Conduit places work on.
 *
 * There is no "assign this automation to that machine" anywhere in this file, and
 * that absence is the point: a runner advertises a class, an OS, and the auth models
 * it can present, and the distributor (`pickRunner`, `@conduit/domain`) matches work
 * to it per run. Nobody names a machine.
 *
 * The pool is deliberately mid-change — one starting, one draining, one offline —
 * because a pool that always looks static hides the elasticity that makes the model
 * cheaper than a rack of always-on desktops.
 *
 * In-memory prototype data. A real pool registers and heartbeats; these rows stand in
 * for that registration until the runner protocol lands.
 */
import type { AuthModel, Runner } from "@conduit/domain";

/** Auth models a runner with no Windows domain identity can present. */
const HEADLESS: AuthModel[] = [
  "none",
  "api-key",
  "oauth-client-credentials",
  "entra-service-principal",
  "managed-identity",
];

/** Everything above, plus the Kerberos identity a domain-joined runner carries. */
const DOMAIN_JOINED: AuthModel[] = [...HEADLESS, "windows-integrated"];

export const runners: Runner[] = [
  /* ------------------------------------------------------------- lightweight
     API-first work. Cheap, stateless, and scaled to demand — the class the
     already-API-shaped share of the estate runs on today. */
  {
    id: "rnr_lw_01",
    name: "lightweight-1",
    runnerClass: "lightweight",
    state: "Busy",
    platform: "linux",
    authModels: HEADLESS,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-lite:1.4.0",
    uptime: "3 minutes",
    currentRunId: "run_1045",
    runsCompleted: 12,
  },
  {
    id: "rnr_lw_02",
    name: "lightweight-2",
    runnerClass: "lightweight",
    state: "Busy",
    platform: "linux",
    authModels: HEADLESS,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-lite:1.4.0",
    uptime: "8 minutes",
    currentRunId: "run_1030",
    runsCompleted: 31,
  },
  {
    id: "rnr_lw_03",
    name: "lightweight-3",
    runnerClass: "lightweight",
    state: "Idle",
    platform: "linux",
    authModels: HEADLESS,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-lite:1.4.0",
    uptime: "22 minutes",
    runsCompleted: 88,
  },
  {
    id: "rnr_lw_04",
    name: "lightweight-4",
    runnerClass: "lightweight",
    state: "Idle",
    platform: "linux",
    authModels: HEADLESS,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-lite:1.4.0",
    uptime: "14 minutes",
    runsCompleted: 47,
  },
  {
    id: "rnr_lw_05",
    name: "lightweight-5",
    runnerClass: "lightweight",
    state: "Starting",
    platform: "linux",
    authModels: HEADLESS,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-lite:1.4.0",
    uptime: "9 seconds",
    runsCompleted: 0,
  },
  {
    id: "rnr_lw_06",
    name: "lightweight-6",
    runnerClass: "lightweight",
    state: "Draining",
    platform: "linux",
    authModels: HEADLESS,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-lite:1.4.0",
    uptime: "41 minutes",
    runsCompleted: 156,
  },

  /* -------------------------------------------------- windows service account
     Headless Windows with a domain identity. This is how the workloads blocked
     only by Windows-integrated auth move before their apps reach Entra. */
  {
    id: "rnr_wsa_01",
    name: "win-service-1",
    runnerClass: "windows-service-account",
    state: "Draining",
    platform: "windows",
    authModels: DOMAIN_JOINED,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-win:1.4.0",
    uptime: "26 minutes",
    runsCompleted: 64,
  },
  {
    id: "rnr_wsa_02",
    name: "win-service-2",
    runnerClass: "windows-service-account",
    state: "Offline",
    platform: "windows",
    authModels: DOMAIN_JOINED,
    ephemeral: true,
    headed: false,
    image: "conduit/runner-win:1.4.0",
    uptime: "—",
    runsCompleted: 0,
  },

  /* ------------------------------------------------- windows interactive
     The heavy class, for genuinely UI-bound work. One runner, idle: no headed
     workload has migrated off the incumbent platform yet, and the pool reflects
     that rather than pretending otherwise. */
  {
    id: "rnr_int_01",
    name: "win-interactive-1",
    runnerClass: "windows-interactive",
    state: "Idle",
    platform: "windows",
    authModels: DOMAIN_JOINED,
    ephemeral: false,
    headed: true,
    image: "conduit/runner-win-desktop:1.4.0",
    uptime: "6 hours",
    runsCompleted: 3,
  },
];

/** Look up a runner by id. */
export const runnerById = (id: string): Runner | undefined => runners.find((r) => r.id === id);
