/**
 * Test doubles for the runtime. **Tests only** — nothing in a shipped path imports
 * this, the same rule `@conduit/connector-sdk/testing` follows.
 */
import { TransportError, type HttpRequest, type HttpResponse, type HttpTransport } from "../http.ts";

/** A canned reply. `body` is JSON-encoded unless it is already a string. */
export type FakeReply = { status?: number; headers?: Record<string, string>; body?: unknown };

/** Replies keyed by `"METHOD url"`, e.g. `"GET https://api.test/invoices"`. */
export type FakeRoutes = Record<string, FakeReply | ((request: HttpRequest) => FakeReply)>;

/**
 * A transport that answers from a table and records what it was asked.
 *
 * An unmatched call throws rather than returning a default: a step that quietly gets a
 * 200 from a URL nobody stubbed is a test that passes for the wrong reason, which is
 * the failure mode a fake transport exists to prevent.
 */
export function fakeTransport(routes: FakeRoutes): { transport: HttpTransport; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    transport: {
      request(request: HttpRequest): Promise<HttpResponse> {
        calls.push(request);
        const match = routes[`${request.method} ${request.url}`] ?? routes[request.url];
        if (!match) {
          return Promise.reject(new TransportError(`no route for ${request.method} ${request.url}`, request.url));
        }
        const reply = typeof match === "function" ? match(request) : match;
        const body = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? null);
        return Promise.resolve({
          status: reply.status ?? 200,
          headers: { "content-type": "application/json", ...(reply.headers ?? {}) },
          body,
        });
      },
    },
  };
}

/** A clock that advances a fixed amount on every read, so elapsed times in a run
 *  result are deterministic instead of "however long the test host took". */
export function tickingClock(startMs = 1_700_000_000_000, stepMs = 10): () => number {
  let current = startMs - stepMs;
  return () => (current += stepMs);
}
