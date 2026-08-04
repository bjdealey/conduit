import { describe, expect, it } from "vitest";
import type { ExecutableStep, RunEvent, RunWork } from "@conduit/domain";
import { executeRun } from "../engine.ts";
import { blockPrivateNetworks } from "../http.ts";
import { fakeTransport, tickingClock } from "../testing/index.ts";

const action = (id: string, actionId: string, config: Record<string, string>): ExecutableStep => ({
  kind: "action",
  id,
  actionId,
  config,
});

const work = (steps: ExecutableStep[], patch: Partial<RunWork> = {}): RunWork => ({
  runId: "run_test",
  workflowId: "wf_invoices",
  workflowVersion: 3,
  requirements: { auth: "none", ui: "none", platform: "any" },
  schemaVersion: 2,
  steps,
  deadlineSeconds: 60,
  ...patch,
});

const kinds = (events: RunEvent[]): string[] => events.map((e) => e.kind);
const messages = (events: RunEvent[]): string[] => events.map((e) => e.message);

describe("executeRun — a flow start to finish", () => {
  it("calls the API, carries a value forward, branches on it, and completes", async () => {
    const { transport, calls } = fakeTransport({
      "GET https://api.test/invoices?status=open": { body: { count: 2, items: [{ id: "inv_1" }, { id: "inv_2" }] } },
      "POST https://api.test/reconcile": { status: 202, body: { accepted: true } },
    });

    const result = await executeRun(
      work([
        action("stp_1", "http.request", { method: "GET", url: "https://api.test/invoices?status=open" }),
        action("stp_2", "data.set", { name: "count", value: "{{ response.body.count }}" }),
        {
          kind: "branch",
          id: "stp_3",
          condition: "{{ count }} > 0",
          then: [
            action("stp_4", "http.request", {
              method: "POST",
              url: "https://api.test/reconcile",
              headers: "authorization: Bearer {{ env.API_TOKEN }}\ncontent-type: application/json",
              body: '{ "first": "{{ response.body.items[0].id }}", "count": {{ count }} }',
            }),
            action("stp_5", "assert.equals", { actual: "{{ response.status }}", expected: "202" }),
          ],
          else: [action("stp_6", "assert.equals", { actual: "unreachable", expected: "never" })],
        },
      ]),
      { http: transport, now: tickingClock(), env: { API_TOKEN: "s3cret-value" } },
    );

    expect(result.state).toBe("completed");
    expect(result.stepsExecuted).toBe(4);
    expect(kinds(result.events)).toEqual([
      "started",
      "step-started",
      "step-finished",
      "step-started",
      "step-finished",
      "log",
      "step-started",
      "step-finished",
      "step-started",
      "step-finished",
      "finished",
    ]);

    // The POST really carried the value the GET produced.
    expect(calls[1].method).toBe("POST");
    expect(JSON.parse(calls[1].body ?? "{}")).toEqual({ first: "inv_1", count: 2 });
    expect(calls[1].headers.authorization).toBe("Bearer s3cret-value");

    // …and the log says which way the branch went, and why.
    expect(messages(result.events).find((m) => m.startsWith("if"))).toContain("→ then (2 > 0)");
  });

  it("takes the else arm and says the arm was empty", async () => {
    const { transport } = fakeTransport({ "GET https://api.test/health": { status: 503, body: { up: false } } });
    const result = await executeRun(
      work([
        action("stp_1", "http.request", { method: "GET", url: "https://api.test/health" }),
        { kind: "branch", id: "stp_2", condition: "{{ response.status }} == 200", then: [], else: [] },
      ]),
      { http: transport, now: tickingClock() },
    );
    expect(result.state).toBe("completed");
    expect(messages(result.events).find((m) => m.startsWith("if"))).toBe(
      "if {{ response.status }} == 200 → else (503 == 200), empty",
    );
  });

  it("never masks a non-2xx as a failure — the assertion decides", async () => {
    const { transport } = fakeTransport({ "GET https://api.test/missing": { status: 404, body: { error: "gone" } } });
    const ok = await executeRun(work([action("stp_1", "http.request", { method: "GET", url: "https://api.test/missing" })]), {
      http: transport,
      now: tickingClock(),
    });
    expect(ok.state).toBe("completed");

    const asserted = await executeRun(
      work([
        action("stp_1", "http.request", { method: "GET", url: "https://api.test/missing" }),
        action("stp_2", "assert.equals", { actual: "{{ response.status }}", expected: "200" }),
      ]),
      { http: transport, now: tickingClock() },
    );
    expect(asserted.state).toBe("failed");
    expect(asserted.failure).toEqual({ stepId: "stp_2", actionId: "assert.equals", message: "expected 200, got 404" });
  });
});

describe("executeRun — failing loudly", () => {
  it("stops at the failed step and reports it, executing nothing after", async () => {
    const { transport, calls } = fakeTransport({ "GET https://api.test/after": { body: {} } });
    const result = await executeRun(
      work([
        action("stp_1", "assert.equals", { actual: "1", expected: "2" }),
        action("stp_2", "http.request", { method: "GET", url: "https://api.test/after" }),
      ]),
      { http: transport, now: tickingClock() },
    );
    expect(result.state).toBe("failed");
    expect(result.stepsExecuted).toBe(1);
    expect(calls).toHaveLength(0);
    expect(kinds(result.events)).toEqual(["started", "step-started", "failed"]);
  });

  it("refuses a node it cannot execute rather than reporting a green run", async () => {
    const result = await executeRun(work([action("stp_1", "browser.open", { engine: "Chromium", mode: "Headless" })]), {
      now: tickingClock(),
    });
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain('no executor for "browser.open"');
    expect(result.failure?.message).toContain("http.request");
  });

  it("fails on an unresolved reference instead of calling a half-built URL", async () => {
    const { transport, calls } = fakeTransport({});
    const result = await executeRun(
      work([action("stp_1", "http.request", { method: "GET", url: "https://api.test/invoices/{{ invoice.id }}" })]),
      { http: transport, now: tickingClock() },
    );
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain('nothing at "invoice.id"');
    expect(calls).toHaveLength(0);
  });

  it("reports a transport failure as a failed step, not a crash", async () => {
    const { transport } = fakeTransport({});
    const result = await executeRun(
      work([action("stp_1", "http.request", { method: "GET", url: "https://api.test/unstubbed" })]),
      { http: transport, now: tickingClock() },
    );
    expect(result.state).toBe("failed");
    expect(result.failure?.stepId).toBe("stp_1");
  });

  it("refuses a flow from a newer schema instead of executing the half it recognises", async () => {
    const result = await executeRun(work([action("stp_1", "data.set", { name: "a", value: "1" })], { schemaVersion: 99 }), {
      now: tickingClock(),
    });
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain("schema v99");
    expect(result.stepsExecuted).toBe(0);
  });

  it("stops when the run outlives its budget", async () => {
    const { transport } = fakeTransport({ "GET https://api.test/slow": { body: {} } });
    // One second per clock read; a two-step flow blows a 1s deadline.
    const result = await executeRun(
      work(
        [
          action("stp_1", "http.request", { method: "GET", url: "https://api.test/slow" }),
          action("stp_2", "http.request", { method: "GET", url: "https://api.test/slow" }),
        ],
        { deadlineSeconds: 1 },
      ),
      { http: transport, now: tickingClock(1_700_000_000_000, 1_000) },
    );
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain("budget");
  });
});

describe("executeRun — what leaves the engine", () => {
  it("masks injected secrets out of every event, and leaves the rest legible", async () => {
    const { transport } = fakeTransport({
      "GET https://api.test/x?key=s3cret-value": { body: { echoed: "s3cret-value" } },
    });
    const result = await executeRun(
      work([
        action("stp_1", "http.request", { method: "GET", url: "{{ env.API_BASE }}/x?key={{ env.API_TOKEN }}" }),
        action("stp_2", "data.set", { name: "echoed", value: "{{ response.body.echoed }}" }),
      ]),
      { http: transport, now: tickingClock(), env: { API_TOKEN: "s3cret-value", API_BASE: "https://api.test" } },
    );
    expect(result.state).toBe("completed");
    const log = messages(result.events).join("\n");
    expect(log).not.toContain("s3cret-value");
    expect(log).toContain("••••");
    // Masking is by name. A base URL is not a credential, and a log that hides it is
    // no longer a record of what the run did.
    expect(log).toContain("https://api.test/x");
  });

  it("numbers events from 1 with no gaps, and streams them as they happen", async () => {
    const streamed: RunEvent[] = [];
    const { transport } = fakeTransport({ "GET https://api.test/ping": { body: { ok: true } } });
    const result = await executeRun(work([action("stp_1", "http.request", { method: "GET", url: "https://api.test/ping" })]), {
      http: transport,
      now: tickingClock(),
      onEvent: (event) => streamed.push(event),
    });
    expect(result.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(streamed).toEqual(result.events);
    expect(result.events.every((e) => e.runId === "run_test")).toBe(true);
  });

  it("refuses a private address when the host says to", async () => {
    const { transport, calls } = fakeTransport({ "GET http://169.254.169.254/latest/meta-data/": { body: {} } });
    const result = await executeRun(
      work([action("stp_1", "http.request", { method: "GET", url: "http://169.254.169.254/latest/meta-data/" })]),
      { http: transport, now: tickingClock(), urlPolicy: blockPrivateNetworks },
    );
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain("link-local");
    expect(calls).toHaveLength(0);
  });

  it("executes a v1 payload, whose steps carry no kind", async () => {
    const { transport } = fakeTransport({ "GET https://api.test/v1": { body: { ok: true } } });
    const result = await executeRun(
      work([{ id: "stp_1", actionId: "http.request", config: { method: "GET", url: "https://api.test/v1" } }]),
      { http: transport, now: tickingClock() },
    );
    expect(result.state).toBe("completed");
  });

  it("records the metrics a flow emitted", async () => {
    const result = await executeRun(
      work([
        action("stp_1", "data.set", { name: "latency", value: "128" }),
        action("stp_2", "metrics.record", { name: "login.latency", value: "{{ latency }}" }),
      ]),
      { now: tickingClock() },
    );
    expect(result.state).toBe("completed");
    expect(result.metrics).toEqual([{ name: "login.latency", value: "128", at: expect.any(String) }]);
  });
});
