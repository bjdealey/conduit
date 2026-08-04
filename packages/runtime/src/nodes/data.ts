/**
 * `data.set` — the transformation half of an API flow.
 *
 * Between two HTTP calls something has to carry a value: an id pulled out of the first
 * response, a total computed from a list, a flag a later branch reads. Without it a
 * flow can only ever be a chain of calls that ignore each other, and every expression
 * has to reach all the way back through `{{ steps.stp_1.body.… }}` to find anything.
 */
import { resolveValue } from "../expression.ts";
import { toText } from "../values.ts";
import { clip, field, requiredField, StepError, type NodeExecutor } from "./types.ts";

/**
 * What a variable may be called.
 *
 * Names are readable unqualified (`{{ total }}`), so a name with a dot in it would
 * read as a path into something else and quietly resolve to nothing. Refusing the name
 * is the honest half-second; the alternative is an author debugging an expression that
 * cannot ever work.
 */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const dataSet: NodeExecutor = async ({ step, ctx }) => {
  const name = requiredField(step, "name");
  if (!NAME.test(name)) {
    throw new StepError(`"${name}" is not a usable variable name (letters, digits and _)`, step.id, step.actionId);
  }

  // `resolveValue`, not `interpolate`: `{{ response.body.items }}` set into a variable
  // stays a list, so a later branch can ask how many there are.
  const value = resolveValue(field(step, "value"), ctx.scope());
  ctx.setVariable(name, value);
  return { output: value, message: ctx.redact(`${name} = ${clip(toText(value), 120)}`) };
};
