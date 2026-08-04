/**
 * The wire, over a real HTTP server.
 *
 * `loop.test.ts` drives the loop against a fake `ControlPlane` object, which proves the
 * sequencing but not the shapes. This one stands up a server that speaks the protocol
 * as `supabase/functions/runner` does — same paths, same token header, same payloads —
 * and runs the real client against it. If the request shape drifts from the protocol,
 * this is where it shows, rather than on a deployed project.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type RunEvent, type RunWork } from "@conduit/domain";
import { identityFromEnv } from "../src/config.ts";
import { serve } from "../src/loop.ts";

const TOKEN = "shared-runner-token";

const work: RunWork = {
  runId: "run_wire_1",
  workflowId: "wf_wire",
  workflowVersion: 2,
  requirements: { auth: "api-key", ui: "none", platform: "any" },
  schemaVersion: 2,
  steps: [
    { kind: "action", id: "stp_1", actionId: "data.set", config: { name: "answer", value: "42" } },
    { kind: "action", id: "stp_2", actionId: "assert.equals", config: { actual: "{{ answer }}", expected: "42" } },
  ],
  deadlineSeconds: 60,
};

/** What the control plane saw, so the test can check the wire rather than the outcome. */
const seen: { action: string; token: string | undefined; body: Record<string, unknown> }[] = [];
const ingested: RunEvent[] = [];
let handedOut = false;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const action = (req.url ?? "").split("/").pop() ?? "";
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      seen.push({ action, token: req.headers["x-runner-token"] as string | undefined, body });

      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      if (req.headers["x-runner-token"] !== TOKEN) return send(401, { error: "unauthorised" });
      if (action === "register") return send(200, { accepted: true, heartbeatSeconds: 0.05, protocolVersion: PROTOCOL_VERSION });
      if (action === "heartbeat") return send(200, { drain: false });
      if (action === "claim") {
        if (handedOut) return send(200, { work: null });
        handedOut = true;
        return send(200, { work });
      }
      if (action === "ingest") {
        const events = (body.events ?? []) as RunEvent[];
        ingested.push(...events);
        return send(200, { accepted: events.length, highWatermark: events.at(-1)?.sequence ?? 0 });
      }
      return send(404, { error: `unknown action ${action}` });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = typeof address === "object" && address ? `http://127.0.0.1:${address.port}/functions/v1/runner` : "";
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const config = () => ({
  ...identityFromEnv({ CONDUIT_RUNNER_ID: "rnr_wire", CONDUIT_RUNNER_NAME: "wire-runner" }),
  controlPlaneUrl: base,
  token: TOKEN,
  pollSeconds: 0.001,
  env: {},
  allowPrivateHosts: false,
});

describe("the runner against a control plane speaking the protocol", () => {
  it("registers, claims, executes, and posts the log over HTTP", async () => {
    const summary = await serve(config(), { log: () => {}, maxIdlePolls: 1, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))) });

    expect(summary).toMatchObject({ runsCompleted: 1, runsFailed: 0 });

    // Every call carried the shared token and the version it speaks.
    expect(seen.every((call) => call.token === TOKEN)).toBe(true);
    expect(seen.every((call) => call.body.protocolVersion === PROTOCOL_VERSION)).toBe(true);
    expect(seen.every((call) => call.body.runnerId === "rnr_wire")).toBe(true);

    // Registration said what this runner *is* — and nothing about what it wants.
    const register = seen.find((call) => call.action === "register");
    expect(register?.body).toMatchObject({ runnerClass: "lightweight", platform: "linux", headed: false, ephemeral: true });
    expect(Object.keys(register?.body ?? {})).not.toContain("workflowId");

    // The claim asked for work by identity alone.
    expect(seen.find((call) => call.action === "claim")?.body).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      runnerId: "rnr_wire",
    });

    // The whole log arrived, in order, ending terminal — which is what lets the
    // control plane finish the run without a separate "I'm done" call.
    expect(ingested.map((e) => e.kind)).toEqual([
      "started",
      "step-started",
      "step-finished",
      "step-started",
      "step-finished",
      "finished",
    ]);
    expect(ingested.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ingested.every((e) => e.runId === "run_wire_1")).toBe(true);
  });

  it("gives up on a token the control plane rejects rather than hammering it", async () => {
    await expect(serve({ ...config(), token: "wrong" }, { log: () => {}, sleep: () => Promise.resolve() })).rejects.toThrow(
      /unauthorised|registration refused/,
    );
  });
});
