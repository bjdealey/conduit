/**
 * `http.request` — the node stage 1 is built around.
 *
 * The vision's API-first workloads are HTTP calls, transformations, conditionals and
 * orchestration. This is the first of those, and everything else in the stage-1 set
 * exists to make a flow of these useful: assertions to check them, a variable to carry
 * something between them, a branch to choose between them.
 */
import { interpolate, resolveValue } from "../expression.ts";
import { TransportError } from "../http.ts";
import { clip, field, requiredField, StepError, type NodeExecutor } from "./types.ts";
import type { RunValue } from "../values.ts";

/** Methods that carry no body. A GET with one is silently dropped by many servers
 *  and rejected by some, so we never send it and say so if one was configured. */
const BODYLESS = new Set(["GET", "HEAD"]);

/** `Name: value` per line, blank lines and `#` comments ignored. */
function parseHeaders(text: string, scope: RunValue): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf(":");
    if (at <= 0) continue;
    headers[trimmed.slice(0, at).trim()] = interpolate(trimmed.slice(at + 1).trim(), scope);
  }
  return headers;
}

/** Whether a header is set, whatever case the author typed it in. */
const has = (headers: Record<string, string>, name: string): boolean =>
  Object.keys(headers).some((key) => key.toLowerCase() === name);

/**
 * A response body as a value a later step can read paths out of.
 *
 * Parsed when it is JSON, kept as text when it isn't — and the raw text is kept either
 * way, because a flow that needs to assert on an exact string still can.
 */
function parseBody(text: string, contentType: string | undefined): RunValue {
  const looksJson = (contentType ?? "").includes("json") || /^\s*[[{]/.test(text);
  if (!looksJson) return text;
  try {
    return JSON.parse(text) as RunValue;
  } catch {
    return text;
  }
}

export const httpRequest: NodeExecutor = async ({ step, ctx, deps }) => {
  const scope = ctx.scope();
  const method = (field(step, "method") || "GET").toUpperCase();

  let target: URL;
  const raw = interpolate(requiredField(step, "url"), scope);
  try {
    target = new URL(raw);
  } catch {
    throw new StepError(`"${clip(ctx.redact(raw), 80)}" is not an absolute URL`, step.id, step.actionId);
  }
  const refusal = deps.urlPolicy(target);
  if (refusal) throw new StepError(`refused to call ${target.host}: ${refusal}`, step.id, step.actionId);

  const headers = parseHeaders(field(step, "headers"), scope);

  let body: string | undefined;
  const configured = field(step, "body");
  if (configured !== "" && !BODYLESS.has(method)) {
    // A body that resolves to an object stays an object: `{{ response.body }}` posted
    // onward has to be the document, not the text "[object Object]".
    const value = resolveValue(configured, scope);
    if (typeof value === "string") {
      body = value;
    } else {
      body = JSON.stringify(value);
      if (!has(headers, "content-type")) headers["content-type"] = "application/json";
    }
  }

  const started = deps.now();
  let response;
  try {
    response = await deps.http.request({ method, url: target.toString(), headers, body, timeoutMs: deps.httpTimeoutMs });
  } catch (error) {
    if (error instanceof TransportError) {
      throw new StepError(`${method} ${ctx.redact(target.toString())} failed: ${error.message}`, step.id, step.actionId);
    }
    throw error;
  }
  const elapsedMs = deps.now() - started;

  const output: RunValue = {
    method,
    url: target.toString(),
    status: response.status,
    // 2xx, exactly as `fetch` means it. Note what this does *not* do: a non-2xx
    // response does not fail the step. A 404 is an answer, and a flow that branches on
    // "not found" is a normal flow — an assertion is where an author says a status was
    // unacceptable, and that is a decision the author makes, not the transport.
    ok: response.status >= 200 && response.status < 300,
    headers: response.headers,
    body: parseBody(response.body, response.headers["content-type"]),
    text: response.body,
    elapsedMs,
  };
  ctx.recordResponse(output);

  const note = configured !== "" && BODYLESS.has(method) ? ` (body ignored — ${method} carries none)` : "";
  return { output, message: `${method} ${target.toString()} → ${response.status} in ${elapsedMs} ms${note}` };
};
