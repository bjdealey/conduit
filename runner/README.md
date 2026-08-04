# conduit-runner — the execution plane

Conduit is the control plane: it authors, places, dispatches and observes. **This is the
thing that executes**, and it is deliberately a separate artefact — it imports
`@conduit/domain` (the protocol both sides code against) and `@conduit/runtime` (the
engine), and nothing else from this repository. It could be lifted into its own repo
tomorrow without the control plane noticing.

Stage 1 executes the **headless, API-first** set: HTTP calls, assertions, variables,
conditionals, metrics. A node it cannot execute fails the run and says so — a browser
step reported as fine by a runner with no browser would be worse than no runner at all.

## Run a workflow right now, with no backend

```bash
node runner/src/cli.ts run runner/examples/invoice-check.json \
  --env API_URL=https://api.example.com \
  --env API_TOKEN=<a token>
```

```
 ▸ 09:41:02  Run started — wf_invoice_check v1, 8 steps
 · 09:41:02  1. http.request
 ✓ 09:41:02  GET https://api.example.com/invoices?status=open → 200 in 106 ms
 · 09:41:02  2. assert.equals
 ✓ 09:41:02  200 matched
 · 09:41:02  3. data.set
 ✓ 09:41:02  openCount = 2
 ↳ 09:41:02  if {{ openCount }} > 0 → then (2 > 0)
 …
 ✓ 09:41:03  Run completed — 7 steps in 141 ms
✓ run_local_msf2xn3d completed — 7 step(s) in 142 ms
```

The exit code is the run's outcome, so a workflow works as a check in CI. `--json`
prints the full result — events, metrics, failure — instead of the log.

The flow file is a workflow exported from the library, the `RunWork` payload the
control plane hands out (paste it from a failed run to reproduce it), or a bare array
of steps. A file written against schema v1 is migrated on the way in.

## Run against the control plane

```bash
export CONDUIT_CONTROL_PLANE_URL=https://<ref>.supabase.co/functions/v1/runner
export CONDUIT_RUNNER_TOKEN=<the function's RUNNER_TOKEN>
export CONDUIT_ENV_API_TOKEN=<a token workflows may use as {{ env.API_TOKEN }}>
node runner/src/cli.ts serve
```

It registers, heartbeats, claims one run at a time, executes it, and posts the log.
`CONDUIT_MAX_RUNS=1`-style single-shot behaviour is `--max-runs 1`; drain is decided by
the control plane and arrives on a heartbeat.

## What it will and won't do

| | |
|---|---|
| **Declares only what it can present** | `CONDUIT_AUTH_MODELS` defaults to `none,api-key`. Claiming an auth model this image cannot actually present means being handed work it must fail. |
| **Checks the work fits before starting it** | The requirements ride along with the work so the runner can refuse a mismatch cleanly, rather than dying three steps in. |
| **Refuses private addresses** | `169.254.169.254` and friends. A workflow authored by someone else runs here; `--allow-private-hosts` / `CONDUIT_ALLOW_PRIVATE_HOSTS=1` is the deliberate opt-out for a runner whose job *is* an internal API. |
| **Passes through only prefixed env** | `CONDUIT_ENV_*`, never the whole environment — the runner's own token lives there too. |
| **Masks credentials in the log** | Env values whose *name* looks like a credential are masked in every event. Base URLs are not, or the log stops being a record. |
| **Carries one version** | `image`. There is no agent version to patch, because there is no agent — a new process is a new runner. |

## Requirements

Node 22.6+ (it runs the TypeScript directly — no build step, no bundler, no
`node_modules` beyond this workspace). Everything the execution plane imports is kept
free of TypeScript syntax that *emits* code — no `enum`, no parameter properties — so
plain `node file.ts` is enough.
