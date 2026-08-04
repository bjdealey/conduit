/**
 * The assertion nodes — where an author says what "worked" means.
 *
 * Nothing else in the runtime decides that a run failed on its own account: an HTTP
 * step reports a 500 as an outcome, not as a failure, because a flow may well be
 * testing for one. An assertion is the author stating the contract, so it is the one
 * node whose whole purpose is to end the run.
 */
import { ExpressionError, resolveValue } from "../expression.ts";
import { TransportError } from "../http.ts";
import { looseEquals, toText, type RunValue } from "../values.ts";
import { clip, field, requiredField, StepError, type NodeExecutor } from "./types.ts";

/**
 * A configured value, or `undefined` when it points at nothing.
 *
 * An assertion swallows the resolution error deliberately: "expected 200, found
 * nothing at `response.status`" tells an author what to fix, where the raw expression
 * failure only tells them the expression failed.
 */
function soften(template: string, scope: RunValue): RunValue | undefined {
  try {
    return resolveValue(template, scope);
  } catch (error) {
    if (error instanceof ExpressionError) return undefined;
    throw error;
  }
}

const show = (value: RunValue | undefined): string => (value === undefined ? "nothing" : clip(toText(value), 80));

export const assertEquals: NodeExecutor = async ({ step, ctx }) => {
  const scope = ctx.scope();
  const actual = soften(requiredField(step, "actual"), scope);
  const expected = soften(requiredField(step, "expected"), scope);

  if (!looseEquals(actual, expected)) {
    throw new StepError(
      ctx.redact(`expected ${show(expected)}, got ${show(actual)}`),
      step.id,
      step.actionId,
    );
  }
  return { output: true, message: ctx.redact(`${show(actual)} matched`) };
};

/** Anything below 400 counts as resolving: a redirect that the transport followed and
 *  a 204 with no content are both a link that works. */
const RESOLVED_BELOW = 400;

export const assertResolves: NodeExecutor = async ({ step, ctx, deps }) => {
  const scope = ctx.scope();
  const raw = toText(soften(requiredField(step, "url"), scope));

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new StepError(`"${clip(ctx.redact(raw), 80)}" is not an absolute URL`, step.id, step.actionId);
  }
  const refusal = deps.urlPolicy(target);
  if (refusal) throw new StepError(`refused to call ${target.host}: ${refusal}`, step.id, step.actionId);

  // `within` is in seconds, as the field says; it caps this step alone, never the run.
  const withinSeconds = Number(field(step, "within"));
  const timeoutMs = Number.isFinite(withinSeconds) && withinSeconds > 0 ? withinSeconds * 1000 : deps.httpTimeoutMs;

  const started = deps.now();
  let status: number;
  try {
    // GET rather than HEAD: plenty of servers answer HEAD with a 405 while the link is
    // perfectly good, and a link check that fails on working links is worse than none.
    ({ status } = await deps.http.request({ method: "GET", url: target.toString(), headers: {}, timeoutMs }));
  } catch (error) {
    if (error instanceof TransportError) {
      throw new StepError(ctx.redact(`${target.toString()} did not resolve: ${error.message}`), step.id, step.actionId);
    }
    throw error;
  }
  const elapsedMs = deps.now() - started;

  if (status >= RESOLVED_BELOW) {
    throw new StepError(ctx.redact(`${target.toString()} returned ${status}`), step.id, step.actionId);
  }
  return { output: status, message: ctx.redact(`${target.toString()} resolved ${status} in ${elapsedMs} ms`) };
};
