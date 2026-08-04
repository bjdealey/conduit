/**
 * The runtime's HTTP seam.
 *
 * Same idea as the A360 connector's transport (`connectors/automation-anywhere/src/http.ts`)
 * — depend on an interface, not on `fetch`, so a test can answer without a network —
 * with two differences the engine needs: response headers (a flow may branch on
 * `content-type` or read a `Location`), and a timeout, because a step that hangs holds
 * a runner for the whole run deadline.
 */

/** One outbound request. */
export type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Absent for GET/HEAD — a body on those is a footgun, not a feature. */
  body?: string;
  timeoutMs: number;
};

/** One response, fully read. */
export type HttpResponse = {
  status: number;
  /** Lower-cased header names, so `{{ response.headers.location }}` is predictable. */
  headers: Record<string, string>;
  body: string;
};

/** The seam the HTTP node calls. */
export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * The request never happened — DNS, TLS, a refused connection, a timeout.
 *
 * Distinct from a response the caller doesn't like: a 500 is an answer, and a flow may
 * legitimately branch on it. This is the absence of one, and it fails the step.
 */
export class TransportError extends Error {
  readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = "TransportError";
    this.url = url;
  }
}

/** Whether a URL may be called. Returns a refusal reason, or null to allow. */
export type UrlPolicy = (url: URL) => string | null;

/** Allow anything the host will resolve. The default, and what the in-browser
 *  test-run path uses — there the browser's own origin rules already apply. */
export const allowAnyUrl: UrlPolicy = () => null;

/** Hostnames and ranges that mean "inside the runner", not "the internet". */
const PRIVATE_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  // Link-local — where every cloud keeps its instance-metadata service, which is the
  // one address a workflow authored by someone else must never be able to reach.
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fd[0-9a-f]{2}:/i,
];

/**
 * Refuse anything that isn't public HTTP(S).
 *
 * A workflow is authored by a citizen builder and executed on infrastructure they do
 * not own. Without this, `GET http://169.254.169.254/latest/meta-data/iam/…` is a
 * legal workflow step, and the review queue is the only thing between a form field and
 * the runner's cloud credentials. The polling runner turns this on by default;
 * `CONDUIT_ALLOW_PRIVATE_HOSTS=1` is the deliberate opt-out for a runner whose whole
 * job is calling an internal API.
 */
export const blockPrivateNetworks: UrlPolicy = (url) => {
  if (url.protocol !== "http:" && url.protocol !== "https:") return `${url.protocol} is not an HTTP scheme`;
  const host = url.hostname;
  if (PRIVATE_PATTERNS.some((pattern) => pattern.test(host))) {
    return `${host} is a private or link-local address`;
  }
  return null;
};

/**
 * The default transport, over the platform `fetch`.
 *
 * `fetch` is the one API present in all three hosts this runs in — a browser tab
 * (the in-app test run), Node (the runner CLI) and Deno (an Edge Function) — which is
 * why the engine has no host-specific import anywhere.
 */
export function fetchTransport(fetchImpl: typeof fetch = globalThis.fetch): HttpTransport {
  return {
    async request({ method, url, headers, body, timeoutMs }: HttpRequest): Promise<HttpResponse> {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { method, headers, body, signal: abort.signal });
        const text = await response.text();
        const out: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          out[key.toLowerCase()] = value;
        });
        return { status: response.status, headers: out, body: text };
      } catch (error) {
        const reason = abort.signal.aborted ? `no response within ${timeoutMs} ms` : String((error as Error).message ?? error);
        throw new TransportError(reason, url);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
