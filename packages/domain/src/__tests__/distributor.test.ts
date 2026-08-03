import { describe, expect, it } from "vitest";
import { pickRunner, poolByClass, readinessMix, runnerFits } from "../distributor.ts";
import {
  DEFAULT_REQUIREMENTS,
  readinessOf,
  requiredRunnerClass,
  type Runner,
  type RunnerClass,
  type WorkflowRequirements,
} from "../runner.ts";

const runner = (id: string, runnerClass: RunnerClass, patch: Partial<Runner> = {}): Runner => ({
  id,
  name: id,
  runnerClass,
  state: "Idle",
  platform: runnerClass === "lightweight" ? "linux" : "windows",
  authModels:
    runnerClass === "lightweight"
      ? ["none", "api-key", "oauth-client-credentials", "entra-service-principal", "managed-identity"]
      : ["none", "api-key", "oauth-client-credentials", "entra-service-principal", "managed-identity", "windows-integrated"],
  ephemeral: runnerClass !== "windows-interactive",
  headed: runnerClass === "windows-interactive",
  image: "conduit/runner:1.4.0",
  uptime: "2 minutes",
  runsCompleted: 0,
  ...patch,
});

const requirements = (patch: Partial<WorkflowRequirements> = {}): WorkflowRequirements => ({
  ...DEFAULT_REQUIREMENTS,
  ...patch,
});

describe("requiredRunnerClass", () => {
  it("routes API-shaped work to the cheapest class", () => {
    expect(requiredRunnerClass(requirements({ auth: "oauth-client-credentials" }))).toBe("lightweight");
    expect(requiredRunnerClass(requirements({ auth: "managed-identity" }))).toBe("lightweight");
  });

  it("routes Windows-integrated auth to a service-account runner, not an interactive one", () => {
    // The whole point of that class: a domain identity without a logged-in session.
    expect(requiredRunnerClass(requirements({ auth: "windows-integrated" }))).toBe("windows-service-account");
  });

  it("routes anything headed to an interactive session", () => {
    expect(requiredRunnerClass(requirements({ ui: "headed" }))).toBe("windows-interactive");
    expect(requiredRunnerClass(requirements({ ui: "headed", auth: "api-key" }))).toBe("windows-interactive");
  });

  it("routes headless Windows-only work to a service-account runner", () => {
    expect(requiredRunnerClass(requirements({ platform: "windows" }))).toBe("windows-service-account");
  });
});

describe("runnerFits", () => {
  it("refuses a runner below the required class", () => {
    expect(runnerFits(runner("l1", "lightweight"), requirements({ ui: "headed" }))).toBe(false);
    expect(runnerFits(runner("w1", "windows-service-account"), requirements({ ui: "headed" }))).toBe(false);
  });

  it("allows a runner above the required class", () => {
    expect(runnerFits(runner("i1", "windows-interactive"), requirements({ auth: "api-key" }))).toBe(true);
  });

  it("refuses a runner that cannot present the required auth model", () => {
    const noKerberos = runner("l1", "lightweight", { authModels: ["none", "api-key"] });
    expect(runnerFits(noKerberos, requirements({ auth: "oauth-client-credentials" }))).toBe(false);
  });

  it("refuses a non-Windows runner for Windows-only work", () => {
    const linuxHost = runner("l1", "windows-service-account", { platform: "linux" });
    expect(runnerFits(linuxHost, requirements({ platform: "windows" }))).toBe(false);
  });
});

describe("pickRunner", () => {
  const pool = [
    runner("i1", "windows-interactive"),
    runner("w1", "windows-service-account"),
    runner("l1", "lightweight"),
  ];

  it("prefers the cheapest class that fits, even when heavier runners are free", () => {
    const { runner: chosen, runnerClass } = pickRunner(requirements({ auth: "api-key" }), pool);
    expect(chosen?.id).toBe("l1");
    expect(runnerClass).toBe("lightweight");
  });

  it("escalates only as far as the requirements demand", () => {
    expect(pickRunner(requirements({ auth: "windows-integrated" }), pool).runner?.id).toBe("w1");
    expect(pickRunner(requirements({ ui: "headed" }), pool).runner?.id).toBe("i1");
  });

  it("falls up a class when the cheaper one is busy", () => {
    const busy = [runner("l1", "lightweight", { state: "Busy" }), runner("w1", "windows-service-account")];
    expect(pickRunner(requirements({ auth: "api-key" }), busy).runner?.id).toBe("w1");
  });

  it("prefers a runner already up over one still starting", () => {
    const mixed = [
      runner("l1", "lightweight", { state: "Starting", runsCompleted: 0 }),
      runner("l2", "lightweight", { state: "Idle", runsCompleted: 9 }),
    ];
    expect(pickRunner(requirements(), mixed).runner?.id).toBe("l2");
  });

  it("spreads work across equally available runners", () => {
    const mixed = [
      runner("l1", "lightweight", { runsCompleted: 12 }),
      runner("l2", "lightweight", { runsCompleted: 3 }),
    ];
    expect(pickRunner(requirements(), mixed).runner?.id).toBe("l2");
  });

  it("is deterministic for an identical pool", () => {
    const twins = [runner("l2", "lightweight"), runner("l1", "lightweight")];
    expect(pickRunner(requirements(), twins).runner?.id).toBe("l1");
    expect(pickRunner(requirements(), twins).runner?.id).toBe("l1");
  });

  it("queues rather than failing when nothing in the pool fits", () => {
    const headlessOnly = [runner("l1", "lightweight")];
    const assignment = pickRunner(requirements({ ui: "headed" }), headlessOnly);
    expect(assignment.runner).toBeNull();
    expect(assignment.runnerClass).toBe("windows-interactive");
    expect(assignment.rationale).toContain("queued");
  });

  it("queues on an empty pool without throwing", () => {
    expect(pickRunner(requirements(), []).runner).toBeNull();
  });

  it("explains every placement it makes", () => {
    for (const req of [
      requirements(),
      requirements({ auth: "oauth-client-credentials" }),
      requirements({ auth: "windows-integrated" }),
      requirements({ ui: "headed" }),
      requirements({ platform: "windows" }),
    ]) {
      expect(pickRunner(req, pool).rationale.length).toBeGreaterThan(0);
    }
  });
});

describe("readinessOf", () => {
  it("splits the workload the way the business case does", () => {
    expect(readinessOf(requirements({ auth: "entra-service-principal" }))).toBe("api-eligible");
    expect(readinessOf(requirements({ auth: "windows-integrated" }))).toBe("entra-pending");
    expect(readinessOf(requirements({ ui: "headed" }))).toBe("headed-bound");
  });

  it("counts headed Windows-auth work as headed-bound, not Entra-pending", () => {
    // Moving this app to Entra doesn't free the workflow — the UI dependency remains.
    expect(readinessOf(requirements({ ui: "headed", auth: "windows-integrated" }))).toBe("headed-bound");
  });
});

describe("readinessMix", () => {
  it("reports every band, including empty ones", () => {
    const mix = readinessMix([{ requirements: requirements() }]);
    expect(mix).toHaveLength(3);
    expect(mix.find((m) => m.readiness === "api-eligible")).toMatchObject({ count: 1, share: 1 });
    expect(mix.find((m) => m.readiness === "headed-bound")).toMatchObject({ count: 0, share: 0 });
  });

  it("does not divide by zero on an empty estate", () => {
    expect(readinessMix([]).every((m) => m.count === 0 && m.share === 0)).toBe(true);
  });
});

describe("poolByClass", () => {
  it("keeps a class that has scaled to zero", () => {
    const groups = poolByClass([runner("l1", "lightweight")]);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.runnerClass === "windows-interactive")?.runners).toEqual([]);
  });
});
