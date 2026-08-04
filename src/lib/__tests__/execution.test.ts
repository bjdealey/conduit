/**
 * The app's side of execution: what the builder produces really runs.
 *
 * `fetch` is stubbed rather than the transport injected, because that is exactly what
 * `executeInBrowser` reaches for — the point of the test is the seam the app actually
 * uses, not a seam invented for it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@conduit/domain";
import { executeInBrowser, toRunWork, unexecutableSteps } from "../execution";
import { blankDraft } from "../builder";
import { commitDraft } from "../builder";
import { newStep } from "../builder";
import type { Workflow, WorkflowStep } from "../../data/types";

const flowWith = (steps: WorkflowStep[]): Workflow => {
  const draft = { ...blankDraft("ls", "prv-drafts"), name: "Invoice check", steps, isNew: true };
  return commitDraft([], draft, "Keith Kennedy").workflows[0];
};

const action = (id: string, actionId: string, config: Record<string, string>): WorkflowStep => ({
  kind: "action",
  id,
  actionId,
  config,
});

/** A `fetch` that answers from a table and records what it was asked. */
function stubFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const reply = routes[`${init.method ?? "GET"} ${String(url)}`];
    if (!reply) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(reply.body ?? null), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("a flow authored here, executed here", () => {
  it("calls the API, branches on the answer, and completes", async () => {
    const calls = stubFetch({
      "GET https://api.test/invoices": { body: { count: 3 } },
      "POST https://api.test/close": { status: 200, body: { ok: true } },
    });

    const workflow = flowWith([
      action("stp_1", "http.request", { method: "GET", url: "https://api.test/invoices" }),
      action("stp_2", "data.set", { name: "open", value: "{{ response.body.count }}" }),
      {
        kind: "branch",
        id: "stp_3",
        condition: "{{ open }} > 0",
        then: [
          action("stp_4", "http.request", {
            method: "POST",
            url: "https://api.test/close",
            body: '{ "count": {{ open }} }',
          }),
          action("stp_5", "assert.equals", { actual: "{{ response.status }}", expected: "200" }),
        ],
        else: [],
      },
    ]);

    const events: RunEvent[] = [];
    const result = await executeInBrowser({ workflow, runId: "run_app_1", onEvent: (e) => events.push(e) });

    expect(result.state).toBe("completed");
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET https://api.test/invoices",
      "POST https://api.test/close",
    ]);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ count: 3 });
    // Streamed as it went, not handed over at the end — which is what lets the run
    // viewer fill in live.
    expect(events).toEqual(result.events);
    expect(events.at(-1)?.kind).toBe("finished");
  });

  it("fails the run at the step that failed, and says which", async () => {
    stubFetch({ "GET https://api.test/down": { status: 503, body: { error: "nope" } } });
    const workflow = flowWith([
      action("stp_1", "http.request", { method: "GET", url: "https://api.test/down" }),
      action("stp_2", "assert.equals", { actual: "{{ response.status }}", expected: "200" }),
    ]);
    const result = await executeInBrowser({ workflow, runId: "run_app_2", onEvent: () => {} });
    expect(result.state).toBe("failed");
    expect(result.failure).toMatchObject({ stepId: "stp_2", message: "expected 200, got 503" });
  });

  it("reports a browser that refused the call as a failed step, not a crash", async () => {
    stubFetch({});
    const workflow = flowWith([action("stp_1", "http.request", { method: "GET", url: "https://blocked.test/x" })]);
    const result = await executeInBrowser({ workflow, runId: "run_app_3", onEvent: () => {} });
    expect(result.state).toBe("failed");
    expect(result.failure?.stepId).toBe("stp_1");
  });
});

describe("what the runner is handed", () => {
  it("stamps the version that exists rather than the latest edit", () => {
    const workflow = flowWith([action("stp_1", "data.set", { name: "a", value: "1" })]);
    const work = toRunWork(workflow, "run_x");
    expect(work).toMatchObject({ runId: "run_x", workflowId: workflow.id, workflowVersion: 1, schemaVersion: 2 });
    // The requirements the library holds, which `commitDraft` already raised to the
    // floor the steps impose — a run is placed on those, not on a fresh derivation.
    expect(work.requirements).toEqual(workflow.requirements);
  });

  it("finds unexecutable node types anywhere in the tree, including inside a branch", () => {
    const steps: WorkflowStep[] = [
      action("stp_1", "http.request", { method: "GET", url: "https://api.test/x" }),
      {
        kind: "branch",
        id: "stp_2",
        condition: "{{ response.ok }}",
        then: [newStep("browser.open", [])],
        else: [action("stp_4", "pdf.render", { template: "invoice-v3", output: "x.pdf" })],
      },
    ];
    // Both arms count: placement and executability are decided before anyone knows
    // which way the branch goes.
    expect(unexecutableSteps(steps)).toEqual(["browser.open", "pdf.render"]);
    expect(unexecutableSteps([steps[0]])).toEqual([]);
  });
});
