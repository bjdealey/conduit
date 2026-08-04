/**
 * What a run knows about itself while it executes.
 *
 * Four scopes, and the boundaries between them are the point:
 *
 * - `run`   — the run's own identity, so a step can stamp what it writes.
 * - `env`   — values the *runner* holds: API keys, base URLs, the things a workflow
 *             must be able to use but must never contain. The control plane never
 *             sends these; the runner injects them at execution time.
 * - `vars`  — what the flow has set for itself.
 * - `steps` — every step's output, keyed by step id, plus `response` as a shorthand
 *             for the last HTTP call (which is what the palette's placeholders
 *             already say: `{{ response.status }}`).
 */
import type { RunValue } from "./values.ts";

/** Which run this is, available to expressions as `{{ run.id }}`. */
export type RunIdentity = {
  runId: string;
  workflowId: string;
  /** The exact workflow version being executed — never "latest". */
  workflowVersion: number;
};

/** A metric a flow recorded while it ran. */
export type RunMetric = { name: string; value: string; at: string };

/** The mutable state of one execution. */
export type RunContext = {
  readonly identity: RunIdentity;
  /** The root an expression reads paths out of. */
  scope(): RunValue;
  /** Set a flow variable, readable as `{{ vars.name }}` and as `{{ name }}`. */
  setVariable(name: string, value: RunValue): void;
  /** Record a step's output, readable as `{{ steps.stp_1.… }}`. */
  recordStep(stepId: string, output: RunValue): void;
  /** Record the latest HTTP response, readable as `{{ response.… }}`. */
  recordResponse(response: RunValue): void;
  /** Record a metric point the flow emitted. */
  recordMetric(metric: RunMetric): void;
  /** Everything the flow recorded, for the run's result. */
  readonly metrics: readonly RunMetric[];
  /** A message with every injected secret value masked. */
  redact(message: string): string;
};

/**
 * The shortest value worth masking.
 *
 * A one- or two-character env value ("1", "eu") would otherwise turn every log line
 * into a wall of dots — and redacting the digit "1" out of a URL is not privacy, it is
 * damage. Anything long enough to be a token is long enough to be caught.
 */
const MIN_REDACTABLE = 6;

/**
 * Which env values are masked, by name.
 *
 * Masking *everything* the runner injected was the first attempt, and it was wrong:
 * `CONDUIT_ENV_API_URL` is not a secret, and a run log reading
 * `GET ••••/invoices → 200` throws away the only forensic record a headless run
 * leaves. Masking by name is the trade: it is predictable, an author controls it by
 * choosing the name, and the names people give credentials are not a mystery. A
 * credential smuggled into a value named `API_URL` is not caught — which is a real
 * limit, and the reason the rule is stated here rather than assumed.
 */
const SECRET_NAME = /token|secret|key|password|passwd|credential|auth|cookie|signature|session/i;

/** What a masked value reads as in the log. */
const MASK = "••••";

export function createRunContext(identity: RunIdentity, env: Record<string, string> = {}): RunContext {
  const vars: Record<string, RunValue> = {};
  const steps: Record<string, RunValue> = {};
  const metrics: RunMetric[] = [];
  let response: RunValue = null;

  // Longest first, so a value that contains another is masked whole rather than
  // leaving its tail behind.
  const secrets = Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && value.length >= MIN_REDACTABLE)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);

  return {
    identity,
    scope: () => ({
      run: { id: identity.runId, workflowId: identity.workflowId, version: identity.workflowVersion },
      env,
      vars,
      steps,
      response,
      // Flow variables are reachable unqualified too: an author who wrote
      // `{{ total }}` after setting `total` means the variable, and there is nothing
      // else it could mean. The qualified form still works and is what the docs use.
      ...vars,
    }),
    setVariable: (name, value) => {
      vars[name] = value;
    },
    recordStep: (stepId, output) => {
      steps[stepId] = output;
    },
    recordResponse: (value) => {
      response = value;
    },
    recordMetric: (metric) => {
      metrics.push(metric);
    },
    metrics,
    /*
     * The last line of defence for the rule that no secret reaches a log.
     *
     * A step's message is built from things the author wrote — a URL, a header name —
     * and an author is perfectly able to write `{{ env.API_TOKEN }}` into a URL. The
     * executors are careful, but "careful" is not a guarantee, and run events are
     * durable and readable by every authenticated user. So every message leaving a
     * step goes through here first, and what it masks is decided by `SECRET_NAME`.
     */
    redact: (message) => secrets.reduce((text, secret) => text.split(secret).join(MASK), message),
  };
}
