/**
 * `metrics.record` — a measurement the run itself took.
 *
 * Deliberately local: it records a point against the run rather than shipping it to a
 * metrics backend, because a runner that needs credentials for an observability system
 * before it can execute a workflow has made the first stage depend on the last one.
 * The points ride home in the run's result, where the control plane already has a
 * durable place to put them.
 */
import { interpolate } from "../expression.ts";
import { clip, field, requiredField, type NodeExecutor } from "./types.ts";

export const metricsRecord: NodeExecutor = async ({ step, ctx, deps }) => {
  const name = requiredField(step, "name");
  const value = interpolate(field(step, "value"), ctx.scope());
  const at = new Date(deps.now()).toISOString();
  ctx.recordMetric({ name, value, at });
  return { output: value, message: ctx.redact(`${name} = ${clip(value, 80)}`) };
};
