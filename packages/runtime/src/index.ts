/**
 * `@conduit/runtime` — the execution engine.
 *
 * **This is the execution plane's first artefact, kept at arm's length on purpose.**
 * Conduit is the control plane: it authors, places, dispatches and observes; runners
 * execute. This package is the executing half, and it is built so it can be lifted
 * into the runner's own repository without the control plane noticing — it imports
 * `@conduit/domain` (the protocol both sides code against) and nothing else. No React,
 * no Supabase, no `src/`, no Node or Deno API. Its only I/O is an injected transport.
 *
 * Three hosts run it unchanged today: the runner CLI in `runner/`, the browser tab
 * that authored the flow (the builder's Test run, which is a runner with no backend),
 * and any Edge Function that wants to execute one. That portability is the reason the
 * seams are injected rather than imported.
 */
export { executeRun, DEFAULT_DEADLINE_SECONDS, DEFAULT_HTTP_TIMEOUT_MS } from "./engine.ts";
export type { EngineDeps, RunResult } from "./engine.ts";
export { createRunContext } from "./context.ts";
export type { RunContext, RunIdentity, RunMetric } from "./context.ts";
export { evaluateCondition, explainCondition, interpolate, resolveValue, ExpressionError } from "./expression.ts";
export type { Operator } from "./expression.ts";
export { allowAnyUrl, blockPrivateNetworks, fetchTransport, TransportError } from "./http.ts";
export type { HttpRequest, HttpResponse, HttpTransport, UrlPolicy } from "./http.ts";
export { EXECUTABLE_ACTIONS, EXECUTORS, executorFor, isExecutable, StepError } from "./nodes/index.ts";
export type { NodeDeps, NodeExecutor, StepInput, StepOutcome } from "./nodes/index.ts";
export { asNumber, lookup, looseEquals, toText, truthy } from "./values.ts";
export type { RunValue } from "./values.ts";
