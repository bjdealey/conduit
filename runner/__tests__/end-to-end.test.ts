/**
 * The claim this stage makes, tested the only way it can honestly be tested: a real
 * HTTP server, a real flow file, a real process.
 *
 * Everything else in the suite uses fakes, and should. This one does not — a fake
 * transport can prove the engine calls what it was told to call, but it cannot prove
 * that a workflow authored in Conduit executes start to finish against an API. So the
 * server here is `node:http`, the flow is the example file that ships in this package,
 * and the last test runs the CLI as a child process and reads its exit code.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { identityFromEnv } from "../src/config.ts";
import { readFlow, runLocal, toWork } from "../src/local.ts";

const run = promisify(execFile);
const EXAMPLE = fileURLToPath(new URL("../examples/invoice-check.json", import.meta.url));
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/**
 * Whether this Node can run the CLI at all.
 *
 * The runner executes its own TypeScript with no build step, which needs unflagged
 * type stripping (Node 22.18+). Below that the child process dies on the host's
 * limitation rather than on anything in the runner, and a failure that says nothing
 * about the code is worse than a skip that names the requirement. CI pins 22, so this
 * only ever fires for someone running the suite on an older local Node.
 */
const [major, minor] = process.versions.node.split(".").map(Number);
const stripsTypes = major > 22 || (major === 22 && minor >= 18);

/** What the fake API was asked to do, so a test can prove the flow really did it. */
const received: { method: string; url: string; auth: string | undefined; body: string }[] = [];

let server: Server;
let origin: string;

const read = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await read(req);
    received.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (req.url?.startsWith("/invoices")) {
      return send(200, { count: 2, items: [{ id: "inv_1", total: 120 }, { id: "inv_2", total: 80 }] });
    }
    if (req.url === "/reconcile") return send(202, { accepted: true, echo: JSON.parse(body || "{}") });
    if (req.url === "/empty") return send(200, { count: 0, items: [] });
    if (req.url === "/boom") return send(500, { error: "everything is on fire" });
    return send(404, { error: "no such thing" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const identity = identityFromEnv({ CONDUIT_RUNNER_ID: "rnr_test", CONDUIT_RUNNER_NAME: "test-runner" });

describe("a workflow, executed start to finish against a real API", () => {
  it("runs the shipped example flow: call, capture, branch, post, assert, measure", async () => {
    received.length = 0;
    const result = await runLocal({
      flow: await readFlow(EXAMPLE),
      identity,
      env: { API_URL: origin, API_TOKEN: "test-token-value" },
      // The server is on loopback, which the default policy exists to refuse.
      allowPrivateHosts: true,
      runId: "run_e2e_1",
    });

    expect(result.state).toBe("completed");
    // Seven of the flow's eight actions: the `else` arm's step is not one of them.
    expect(result.stepsExecuted).toBe(7);

    // It really called the API, twice, with the token it was given.
    expect(received.map((r) => `${r.method} ${r.url}`)).toEqual(["GET /invoices?status=open", "POST /reconcile"]);
    expect(received[0].auth).toBe("Bearer test-token-value");

    // …and the POST carried values read out of the GET's response.
    expect(JSON.parse(received[1].body)).toEqual({ invoiceId: "inv_1", count: 2 });

    // The metric the flow recorded came from the API, not from the flow.
    expect(result.metrics).toEqual([{ name: "invoices.reconciled", value: "2", at: expect.any(String) }]);

    const log = result.events.map((e) => e.message).join("\n");
    // The token is masked out of the durable log…
    expect(log).not.toContain("test-token-value");
    // …and the URL is not, or the log would stop being a record of what happened.
    expect(log).toContain(`GET ${origin}/invoices?status=open → 200`);
  });

  it("takes the other arm when the API says there is nothing to do", async () => {
    received.length = 0;
    const flow = (await readFlow(EXAMPLE)) as { steps: { config?: Record<string, string> }[] };
    flow.steps[0].config!.url = "{{ env.API_URL }}/empty";

    const result = await runLocal({
      flow,
      identity,
      env: { API_URL: origin, API_TOKEN: "test-token-value" },
      allowPrivateHosts: true,
      runId: "run_e2e_2",
    });

    expect(result.state).toBe("completed");
    expect(received.map((r) => r.method)).toEqual(["GET"]); // no reconcile call
    expect(result.metrics).toEqual([{ name: "invoices.reconciled", value: "0", at: expect.any(String) }]);
  });

  it("fails the run at the assertion when the API misbehaves, and executes nothing after", async () => {
    received.length = 0;
    const flow = (await readFlow(EXAMPLE)) as { steps: { config?: Record<string, string> }[] };
    flow.steps[0].config!.url = "{{ env.API_URL }}/boom";

    const result = await runLocal({
      flow,
      identity,
      env: { API_URL: origin, API_TOKEN: "test-token-value" },
      allowPrivateHosts: true,
      runId: "run_e2e_3",
    });

    expect(result.state).toBe("failed");
    expect(result.failure).toMatchObject({ stepId: "stp_2", actionId: "assert.equals" });
    expect(result.failure?.message).toBe("expected 200, got 500");
    expect(received.map((r) => r.method)).toEqual(["GET"]);
    expect(result.events.at(-1)?.kind).toBe("failed");
  });

  it("refuses to reach a loopback address unless the runner was told it may", async () => {
    const result = await runLocal({
      flow: await readFlow(EXAMPLE),
      identity,
      env: { API_URL: origin, API_TOKEN: "test-token-value" },
      allowPrivateHosts: false,
      runId: "run_e2e_4",
    });
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain("private or link-local");
  });

  it("refuses work it cannot carry, before starting it", async () => {
    const flow = (await readFlow(EXAMPLE)) as Record<string, unknown>;
    flow.requirements = { auth: "windows-integrated", ui: "none", platform: "windows" };
    const result = await runLocal({
      flow,
      identity,
      env: { API_URL: origin, API_TOKEN: "x" },
      allowPrivateHosts: true,
      runId: "run_e2e_5",
    });
    expect(result.state).toBe("failed");
    expect(result.failure?.message).toContain("cannot carry");
    expect(result.stepsExecuted).toBe(0);
  });
});

describe("toWork", () => {
  it("migrates a v1 flow file — steps with no kind — rather than refusing it", () => {
    const work = toWork(
      { id: "wf_old", steps: [{ id: "stp_1", actionId: "data.set", config: { name: "a", value: "1" } }] },
      "run_x",
    );
    expect(work.schemaVersion).toBe(2);
    expect(work.steps[0]).toMatchObject({ kind: "action", actionId: "data.set" });
  });

  it("accepts a bare step array", () => {
    const work = toWork([{ id: "stp_1", actionId: "data.set", config: { name: "a", value: "1" } }], "run_y");
    expect(work.steps).toHaveLength(1);
    expect(work.workflowId).toBe("wf_local");
  });

  it("says so when there is no flow in the file", () => {
    expect(() => toWork({ name: "nothing here" }, "run_z")).toThrow(/no steps/);
  });
});

describe.skipIf(!stripsTypes)(`the CLI as a process (needs Node 22.18+, on ${process.versions.node})`, () => {
  it("executes the flow and exits 0", async () => {
    const { stdout } = await run(
      process.execPath,
      [CLI, "run", EXAMPLE, "--env", `API_URL=${origin}`, "--env", "API_TOKEN=test-token-value", "--allow-private-hosts"],
      { env: { ...process.env } },
    );
    expect(stdout).toContain("Run started");
    expect(stdout).toContain("→ 202");
    expect(stdout).toMatch(/completed — 7 step\(s\)/);
  });

  it("exits non-zero when the run fails, so a workflow can be a check", async () => {
    // No API_TOKEN, so the authorization header cannot be built. The run fails at the
    // first step rather than calling the API without credentials.
    await expect(
      run(process.execPath, [CLI, "run", EXAMPLE, "--env", `API_URL=${origin}`, "--allow-private-hosts"]),
    ).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining("env.API_TOKEN") });
  });
});
