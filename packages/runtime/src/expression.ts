/**
 * The `{{ }}` vocabulary, evaluated.
 *
 * The builder already writes `{{ response.status }}` into its fields, so the runtime's
 * job is to mean it rather than to invent a second language. Two operations: fill a
 * template in (a URL, a header, a body), and answer a branch's question.
 *
 * **There is no `eval` here, and there must never be one.** Workflow text is authored
 * by citizen builders and submitted for review; if an expression could reach the host
 * language, the authoring surface would be a remote-code-execution surface and the
 * review queue would be the only thing standing between a form field and the runner's
 * process. So this is a small, total grammar: read a path, compare two operands. It
 * cannot call anything, and it cannot reach anything the run context does not hold.
 */
import { asNumber, lookup, looseEquals, toText, truthy, type RunValue } from "./values.ts";

/** A template or condition that could not be evaluated. Fails the step it came from. */
export class ExpressionError extends Error {
  /** The text that failed, verbatim, so the run log can quote it. */
  readonly expression: string;
  /** The path that could not be resolved, when that is what went wrong. */
  readonly path?: string;

  constructor(message: string, expression: string, path?: string) {
    super(message);
    this.name = "ExpressionError";
    this.expression = expression;
    this.path = path;
  }
}

/** One `{{ … }}` hole in a template. */
const HOLE = /\{\{([^}]*)\}\}/g;

/** A template that is nothing but one hole, e.g. `{{ response.body }}`. */
const WHOLE = /^\s*\{\{([^}]*)\}\}\s*$/;

/**
 * Fill a template's holes from the run scope.
 *
 * An unresolved path throws. That looks unhelpful until you consider the alternative:
 * `POST /invoices/{{ invoice.id }}` with an empty id is a request to a different
 * endpoint, and it will often succeed — so the failure has to happen here, where it
 * still names the path that was missing, rather than three steps later.
 */
export function interpolate(template: string, scope: RunValue): string {
  return template.replace(HOLE, (_match, path: string) => {
    const value = lookup(scope, path);
    if (value === undefined) {
      throw new ExpressionError(`nothing at "${path.trim()}"`, template, path.trim());
    }
    return toText(value);
  });
}

/**
 * A template's value, keeping its type when the template is exactly one hole.
 *
 * `{{ response.body }}` as a request body has to stay an object; interpolating it into
 * a string would post the text `[object Object]`, or — once JSON-encoded — a string
 * where the API expects a document. Mixed text (`id-{{ order.id }}`) is a string by
 * construction, so it interpolates as normal.
 */
export function resolveValue(template: string, scope: RunValue): RunValue {
  const whole = WHOLE.exec(template);
  if (!whole) return interpolate(template, scope);
  const path = whole[1];
  const value = lookup(scope, path);
  if (value === undefined) {
    throw new ExpressionError(`nothing at "${path.trim()}"`, template, path.trim());
  }
  return value;
}

/* ---------------------------------------------------------------- conditions */

/** The comparisons a branch condition can make. */
const SYMBOL_OPERATORS = ["==", "!=", ">=", "<=", ">", "<"] as const;
const WORD_OPERATORS = ["contains"] as const;

/** A comparison operator in a branch condition. */
export type Operator = (typeof SYMBOL_OPERATORS)[number] | (typeof WORD_OPERATORS)[number];

const isWordEdge = (char: string | undefined): boolean => char === undefined || /\s/.test(char);

/**
 * Split a condition into `left op right`, or null when it is a bare truthiness test.
 *
 * The scan tracks whether it is inside a `{{ }}` hole or a quoted string, so a path
 * containing `<` or a quoted `"a > b"` is not mistaken for the operator — the operator
 * is the first one found at the top level, and nowhere else.
 */
function split(condition: string): { left: string; operator: Operator; right: string } | null {
  let quote: string | null = null;
  let inHole = false;
  for (let i = 0; i < condition.length; i++) {
    const rest = condition.slice(i);
    if (quote) {
      if (condition[i] === quote) quote = null;
      continue;
    }
    if (inHole) {
      if (rest.startsWith("}}")) {
        inHole = false;
        i++;
      }
      continue;
    }
    if (rest.startsWith("{{")) {
      inHole = true;
      i++;
      continue;
    }
    if (condition[i] === '"' || condition[i] === "'") {
      quote = condition[i];
      continue;
    }
    for (const operator of SYMBOL_OPERATORS) {
      if (rest.startsWith(operator)) {
        return { left: condition.slice(0, i), operator, right: condition.slice(i + operator.length) };
      }
    }
    for (const operator of WORD_OPERATORS) {
      if (
        rest.toLowerCase().startsWith(operator) &&
        isWordEdge(condition[i - 1]) &&
        isWordEdge(condition[i + operator.length])
      ) {
        return { left: condition.slice(0, i), operator, right: condition.slice(i + operator.length) };
      }
    }
  }
  return null;
}

/**
 * One side of a comparison, as a value.
 *
 * A missing path is `undefined` here rather than an error, unlike an interpolation: a
 * condition is a *question*, and "is there an error field" is a fair one to ask of a
 * response that may not have one. Sending an unresolved value somewhere is the thing
 * that must fail loudly; asking about it is not.
 */
function operand(text: string, scope: RunValue): RunValue | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;

  const whole = WHOLE.exec(trimmed);
  if (whole) return lookup(scope, whole[1]);

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    // Quoted text is literal, holes and all — `"{{ raw }}"` is that string.
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const numeric = asNumber(trimmed);
  if (numeric !== null && /^-?\d+(\.\d+)?$/.test(trimmed)) return numeric;

  // Anything else is text, with its holes filled — `order-{{ order.id }}` compares as
  // the string it renders to. An unresolvable hole makes the whole side undefined
  // rather than throwing, for the same reason as above.
  try {
    return interpolate(trimmed, scope);
  } catch {
    return undefined;
  }
}

/** Whether `left` contains `right`, for the three things "contains" can mean. */
function contains(left: RunValue | undefined, right: RunValue | undefined): boolean {
  if (Array.isArray(left)) return left.some((item) => looseEquals(item, right));
  if (typeof left === "object" && left !== null) return Object.keys(left).includes(toText(right));
  return toText(left).includes(toText(right));
}

/** Compare two operands, numerically when both read as numbers and as text otherwise. */
function order(left: RunValue | undefined, right: RunValue | undefined): number {
  const a = asNumber(left);
  const b = asNumber(right);
  if (a !== null && b !== null) return a - b;
  return toText(left).localeCompare(toText(right));
}

/**
 * Answer a branch's condition.
 *
 * With no operator this is a truthiness test, so `{{ response.body.items }}` reads as
 * "did we get any" — which is what an author writing that means, and what
 * `truthy` in `values.ts` is careful to answer honestly for an empty list.
 */
export function evaluateCondition(condition: string, scope: RunValue): boolean {
  if (condition.trim() === "") {
    throw new ExpressionError("a branch needs a condition", condition);
  }
  const parts = split(condition);
  if (!parts) return truthy(operand(condition, scope));

  const left = operand(parts.left, scope);
  const right = operand(parts.right, scope);
  switch (parts.operator) {
    case "==":
      return looseEquals(left, right);
    case "!=":
      return !looseEquals(left, right);
    case ">":
      return order(left, right) > 0;
    case ">=":
      return order(left, right) >= 0;
    case "<":
      return order(left, right) < 0;
    case "<=":
      return order(left, right) <= 0;
    case "contains":
      return contains(left, right);
  }
}

/**
 * A condition with its operands resolved, for the run log.
 *
 * `{{ response.status }} == 200` reading back as `500 == 200` is the difference
 * between a log that says a branch was taken and one that says why — and on a headless
 * run the log is the only thing anyone can look at afterwards.
 */
export function explainCondition(condition: string, scope: RunValue): string {
  const parts = split(condition);
  const show = (text: string) => {
    const value = operand(text, scope);
    return value === undefined ? "(unset)" : toText(value);
  };
  if (!parts) return show(condition);
  return `${show(parts.left)} ${parts.operator} ${show(parts.right)}`;
}
