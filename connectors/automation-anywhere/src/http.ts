/**
 * A minimal HTTP transport seam. The connector depends on this interface, not on
 * `fetch` directly, so tests inject a fake Control Room and no live network is used.
 */
export type HttpRequest = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
};

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/** Default transport over the platform `fetch`. */
export const fetchTransport: HttpTransport = {
  async request({ url, method, headers, body }: HttpRequest): Promise<HttpResponse> {
    const res = await fetch(url, { method, headers, body });
    return {
      ok: res.ok,
      status: res.status,
      json: () => res.json(),
      text: () => res.text(),
    };
  },
};

/** Join a base URL and a path without doubling the slash. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
