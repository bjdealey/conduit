/**
 * The values a run carries, and how a path reads one out.
 *
 * Everything a step produces has to survive being written to `run_events`, posted to
 * an API, and read back by an expression — so it is JSON, and nothing else. A step
 * that wants to hand on a Date or a class instance has to say what it means first.
 */

/** Any value a step can produce or an expression can read. JSON, deliberately. */
export type RunValue = string | number | boolean | null | RunValue[] | { [key: string]: RunValue };

/** A path segment: an object key, or an array index. */
type Segment = { key: string } | { index: number };

/**
 * Split a path into segments: `response.body.items[0].id` reads as four steps.
 *
 * Bracket indices are their own segment rather than part of the key, so `items[0]`
 * and `items.0` mean the same thing — an author writing either gets what they meant.
 */
function segments(path: string): Segment[] {
  const out: Segment[] = [];
  for (const part of path.split(".")) {
    const head = /^([^[\]]*)/.exec(part)?.[1] ?? "";
    if (head !== "") out.push(/^\d+$/.test(head) ? { index: Number(head) } : { key: head });
    for (const [, index] of part.matchAll(/\[(\d+)\]/g)) out.push({ index: Number(index) });
  }
  return out;
}

/**
 * Read a path out of a value, or `undefined` if it isn't there.
 *
 * `undefined` is the one thing a `RunValue` can never *be*, which is what makes it a
 * usable "not found" — an author who writes `{{ order.totl }}` gets a loud failure
 * rather than an empty string quietly posted to a payments API.
 */
export function lookup(root: RunValue, path: string): RunValue | undefined {
  let current: RunValue | undefined = root;
  for (const segment of segments(path.trim())) {
    if (current === null || current === undefined) return undefined;
    if ("index" in segment) {
      if (!Array.isArray(current)) return undefined;
      current = current[segment.index];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, RunValue>)[segment.key];
    }
  }
  return current;
}

/**
 * A value as text, for interpolation into a URL, a header, or a log line.
 *
 * `null` renders as `"null"` rather than as nothing: a missing value that silently
 * becomes an empty string is how a request goes out to the wrong URL and still
 * returns 200.
 */
export function toText(value: RunValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Whether a value reads as a number, so a comparison can be numeric. */
export function asNumber(value: RunValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Equality as an author means it.
 *
 * `{{ response.status }} == 200` has to hold whether the status arrived as the number
 * 200 or the string "200" — the author is comparing a status to a status, and which
 * side of the JSON boundary each came from is not their problem. Two numbers compare
 * numerically; anything else compares as text.
 */
export function looseEquals(a: RunValue | undefined, b: RunValue | undefined): boolean {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb;
  return toText(a) === toText(b);
}

/**
 * Whether a value is true enough to take a branch.
 *
 * Two departures from JavaScript, both because config values arrive as strings: the
 * text `"false"` is false (it came out of a form field that said false), and an empty
 * array or object is false (a branch guarded on `{{ response.body.items }}` means
 * "did we get any", and JavaScript answering "yes, zero of them" is a trap).
 */
export function truthy(value: RunValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return text !== "" && text !== "false" && text !== "0" && text !== "null";
  }
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}
