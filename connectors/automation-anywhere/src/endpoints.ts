/**
 * A360 Control Room REST surface.
 *
 * Paths and payload shapes that are NOT verified against a live Control Room are
 * flagged `TODO(a360)` with the exact open question, per this stage's uncertainty
 * rule. Nothing uncertain is hard-wired as if confirmed; the token-lifecycle and
 * mapping *logic* around these is fully implemented and tested against a fake.
 */

/**
 * Username + API-key (or password) authentication. Reasonably well established:
 * `POST {controlRoom}/v1/authentication` with `{ username, apiKey }` returning
 * `{ token }`.
 */
export const AUTH_PATH = "/v1/authentication";

/**
 * OAuth refresh-token grant.
 * TODO(a360): confirm the OAuth access-token refresh endpoint and request/response
 * shape for a refresh_token grant against Control Room. The API-key re-auth path is
 * implemented and tested; this OAuth path is structured but UNVERIFIED.
 */
export const OAUTH_TOKEN_PATH = "/v1/authentication/token";

/**
 * Workflow listing.
 * TODO(a360): confirm the workflow-listing endpoint and request-body schema. Workflows are
 * repository files; this is believed to be `POST /v2/repository/file/list` with a
 * TaskBot type filter, but the exact filter/sort/pagination schema is UNVERIFIED.
 */
export const WORKFLOW_LIST_PATH = "/v2/repository/file/list";

/**
 * The authenticated-request header carrying the JWT.
 * TODO(a360): confirm whether Control Room expects `X-Authorization: <token>` (used
 * here) or `Authorization: Bearer <token>`. Both are sent to be safe until confirmed.
 */
export const AUTH_HEADER = "x-authorization";

/**
 * Best-effort request body for the workflow listing.
 * TODO(a360): confirm the filter schema (field name for file type, the TaskBot MIME
 * `application/vnd.aa.taskbot`, and pagination). Left as a documented placeholder.
 */
export function workflowListRequestBody(): Record<string, unknown> {
  return {
    // TODO(a360): verify this filter shape against the real endpoint.
    filter: {
      operator: "eq",
      field: "type",
      value: "application/vnd.aa.taskbot",
    },
    sort: [{ field: "name", direction: "asc" }],
    page: { offset: 0, length: 200 },
  };
}
