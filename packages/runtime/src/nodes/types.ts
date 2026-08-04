/**
 * What a node executor is, and what it is given.
 *
 * One executor per node type, and nothing else in the engine knows what any node
 * does. That is the same promise the palette makes to an author — "a new node type is
 * metadata, not a rewrite of the canvas" — kept on the execution side: a new node is a
 * function in this folder and a line in the registry.
 */
import type { ExecutableAction } from "@conduit/domain";
import type { RunContext } from "../context.ts";
import type { HttpTransport, UrlPolicy } from "../http.ts";
import type { RunValue } from "../values.ts";

/** The host capabilities an executor may use. Everything else it must not touch. */
export type NodeDeps = {
  http: HttpTransport;
  /** Milliseconds since the epoch, injected so a test can freeze the clock. */
  now: () => number;
  /** Which URLs this host will call. */
  urlPolicy: UrlPolicy;
  /** Per-request ceiling for an HTTP step. */
  httpTimeoutMs: number;
};

/** Everything an executor gets: its step, the run's state, and the host's seams. */
export type StepInput = { step: ExecutableAction; ctx: RunContext; deps: NodeDeps };

/** What an executor reports back. */
export type StepOutcome = {
  /** Recorded under `{{ steps.<step id> }}` when the step produces anything. */
  output?: RunValue;
  /** One line for the run log. Redacted before it is emitted. */
  message: string;
};

/** Executes one configured step. Throws `StepError` when the step cannot do its job. */
export type NodeExecutor = (input: StepInput) => Promise<StepOutcome>;

/**
 * A step that could not do its job — a bad URL, a failed assertion, a node this
 * runner cannot execute. Fails the run at that step, by design: a flow that carries on
 * past a step that did not happen is producing an answer nobody can trust.
 */
export class StepError extends Error {
  readonly stepId: string;
  readonly actionId: string;

  constructor(message: string, stepId: string, actionId: string) {
    super(message);
    this.name = "StepError";
    this.stepId = stepId;
    this.actionId = actionId;
  }
}

/** A step's configured value, trimmed. Missing and blank are the same thing here:
 *  the builder prefills fields, so an empty one means the author cleared it. */
export function field(step: ExecutableAction, id: string): string {
  return (step.config?.[id] ?? "").trim();
}

/** A field that must be there. */
export function requiredField(step: ExecutableAction, id: string): string {
  const value = field(step, id);
  if (value === "") throw new StepError(`"${id}" is empty`, step.id, step.actionId);
  return value;
}

/** Keep a log line to one line. A 4 MB response body in the run log helps nobody and
 *  is stored forever. */
export function clip(text: string, max = 160): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}
