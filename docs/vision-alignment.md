# Vision alignment — assessment and recommended changes

An assessment of the Conduit application against the **Automation Platform — Vision** document
(IT Director / CIO audience). Every claim about the current app cites a file and line. Nothing in
this document has been implemented; it is a proposal for review.

---

## 0. The headline

The vision and the application are **aimed at two different products that happen to share a name**,
and the repo currently commits to the smaller of the two.

| | Vision document | Conduit today (`CLAUDE.md`, the code) |
|---|---|---|
| What is being built | A **replacement automation platform** — builder, runtime, runner pool, distributor, tiered access | A **pluggable integration layer** over vendor platforms — connectors, capabilities, normalised domain models |
| Central object | A **workflow** made of **nodes**, executed on a **runner** chosen by a **distributor** | A **`Bot`** normalised out of a vendor API (`packages/domain/src/models.ts:31`) |
| Central proof | "A stateless runtime can execute that workflow end-to-end… nodes lighting up, logs streaming" (§7) | A control-plane UI over seed data; runs are fabricated (`src/lib/builder.ts:147`) |
| First-class vendor | AA is the thing being **replaced** | AA is the first thing being **connected to** (`connectors/automation-anywhere`) |

Both framings are coherent, and they are **complementary rather than contradictory** — the
integration layer is exactly the control plane a strangler migration needs (vision Phase 6). But
right now nothing in the repo states which is primary, so the two drift apart with every change.
Resolving that is recommendation #0 and it gates everything else.

**The sharpest single finding:** the vision's Phase 0 is described as "done, or nearly — cross-platform
runtime executing six node types end-to-end, run viewer showing live execution, runs on a laptop"
(§8). **This repo contains no execution runtime.** `testRun()` fabricates a `Run` object with a canned
log (`src/lib/builder.ts:147-168`); `Run.target` is a free-text string (`src/data/types.ts:113`).
If Conduit is the prototype the CIO will be shown, that claim is not yet supported. See §3, Gap 6.

---

## 1. What the app is today

A React/Vite/TS prototype on GitHub Pages, built on an issue-tracker chassis, plus a four-stage
integration layer (connector SDK → A360 connector → Supabase → frontend seam).

- **Builder** (`src/components/AutomationBuilder.tsx`) — palette → **linear ordered step list** → per-step
  config, with Steps and Diagram modes (`src/data/viewLayout.tsx:21`).
- **Node palette** — 15 actions across 10 packages, hardcoded in the frontend bundle
  (`src/data/actions.ts:41`).
- **Execution** — none. Runs are seed data or fabricated.
- **Ops surfaces** — Activity (runs), Inbox (incidents), Manage (schedules / event triggers /
  credentials / packages / globals), Users, Administration (platform users, roles, licences,
  policies), Surfaces, Environments, Settings → Integrations.
- **Integration layer** — `Capability` enum with 8 ids (`packages/domain/src/capability.ts:6`),
  registry + `BotService` + `SecretStore`, the A360 connector, Supabase schema/functions, and a
  capability-gated nav (`src/data/nav.ts:21`).

---

## 2. Alignment scorecard

| Vision claim | Where it should live | Status |
|---|---|---|
| API-first execution as the default runtime (§3) | `packages/runtime` | ❌ **Absent** — no executor exists |
| Stateless, ephemeral runners (§3) | Domain model + a pool view | ❌ **Absent** — a runner is a string, `src/data/manage.ts:20` |
| Smart distribution (§3, §6) | Distributor + routing rationale on a run | ❌ **Absent** — no requirements, no pool, no routing |
| Hybrid runner pool, three types (§6) | Runner domain model | ❌ **Absent** |
| Workflow declares its requirements (§6) | `Automation` type | ❌ **Absent** — `src/data/types.ts:141` has no requirements field |
| Extensible node types behind one interface (§6) | Node-type registry | 🟡 **Partial** — `StepAction` is a decent interface (`src/data/actions.ts:26`), but there is no execution side to it |
| Data-driven builder — new node = metadata (§6) | Node-type catalogue served from the backend | ❌ **Contradicted** — a new node means editing `src/data/actions.ts` and redeploying the SPA |
| Versioned, extensible workflow schema (§6) | `Automation.schemaVersion` | ❌ **Absent** |
| Distribution as a first-class capability (§6) | `Capability` enum | ❌ **Absent** — the 8 capabilities are all AA-shaped |
| Tiered access: consumer / citizen / professional (§3, §6) | `Role` | ❌ **Mismatched** — roles are `admin \| developer \| user` (`src/data/types.ts:80`) |
| Review lifecycle promoting citizen work (§3, §6) | `AutomationStatus` | ❌ **Absent** — `Active \| Paused \| Draft` (`src/data/types.ts:122`) |
| AI as a first-class extension point (§3, §6) | Node palette | ❌ **Absent** — no AI package or node |
| Cross-platform runtime (§5, §6) | `packages/runtime` | ❌ **Unprovable** — nothing to run |
| Observable execution, live (§7) | Activity view | 🟡 **Partial** — the run-viewer UI exists and is good; the events behind it are seed data |
| Per-workflow AA-or-new routing, reversible (§8 Phase 6) | Connector layer | 🟢 **Strong foundation** — the connector/capability layer is the right machinery, but the app never shows the two estates side by side |
| Workload mix: 30 % API / 20 % Windows-auth / 50 % headed (§2) | An estate/readiness view | ❌ **Absent** — the whole business case has nowhere to live in the UI |

Two green-ish rows and one strong foundation. The connector layer is genuinely well built and
**under-used by the vision**; almost everything else the vision leads with is missing from the model.

---

## 3. The gaps, ranked

### Gap 0 — Decide what Conduit is, and write it down

Update `CLAUDE.md` with a short *Product framing* section:

> Conduit is two things behind one UI. (1) **The control plane** for the automation estate —
> pluggable connectors normalise every platform, including Automation Anywhere, into one domain
> model. (2) **The native execution platform** — a builder, an API-first runtime, and a runner
> pool. The native platform is exposed to the control plane as **just another connector** (type
> `conduit`), so migrating a workload from AA to Conduit is a change of `platform` on one row, and
> both estates render through the same screens.

That sentence makes the vision's strangler (Phase 6) an architectural fact rather than a promise,
and it stops future sessions building the two halves in different directions. The seed adapter
already stamps `platform: "conduit-native"` (`src/data/toDomain.ts:22`) — the idea is half-present
and unstated.

### Gap 1 — A runner is a string. Make it a first-class model. *(highest value for the pitch)*

The entire business case — cost, reliability, distribution — rests on the runner pool, and the app
has no runner entity. Today a runner appears only as free text: `target: "prod-runner-1"`
(`src/data/manage.ts:24-27`, `src/data/types.ts:113`).

**Change**
- Add `Runner` to `packages/domain` with the vision's three classes verbatim (§6):
  `lightweight` | `windows-service-account` | `windows-interactive`, plus `state`
  (`Idle | Busy | Starting | Draining | Offline`), `platform` (`linux | windows | macos`),
  `authModels: AuthModel[]`, `ephemeral: boolean`, `startedAt`, `currentRunId?`.
- Add a `runners` capability (or re-point the existing `devices` capability at it — `devices` is
  the AA word for the same thing, and re-using it keeps the capability set stable).
- **Repurpose the Environments view into Runners.** `Environment` (`src/data/environments.ts:4`)
  is leftover deployment-platform DNA — branch, release, URL, region, `eventsPerMin` — from the
  marketing template. It occupies exactly the nav slot the runner pool should own
  (`src/data/nav.ts:21`), and it already has the list/grid shell and status cards the pool needs.

**Why first:** it converts two of the three bets (stateless runners, smart distribution) from prose
into a screen, and it costs a model plus a view re-skin.

### Gap 2 — Workflows don't declare requirements, so distribution can't be demonstrated

Vision §6: *"A workflow declares its requirements (auth model, UI dependency, target platform), and
the distributor routes it to a runner that fits."* `Automation` (`src/data/types.ts:141`) has no
such field, so there is nothing for a distributor to route on.

**Change**
- Add to `Automation`:
  ```ts
  /** What a workflow needs from a runner. Derived from its steps where possible;
   *  overridable per workflow. This is what the distributor routes on. */
  type WorkflowRequirements = {
    auth: "none" | "api-key" | "oauth-client-credentials" | "entra-service-principal"
        | "managed-identity" | "windows-integrated";
    ui: "none" | "headed";
    platform: "any" | "windows";
  };
  ```
- Add matching `requires` metadata to each node type in the palette (`StepAction`,
  `src/data/actions.ts:26`) and **derive** the workflow's requirements from its steps — exactly the
  pattern `packagesForSteps()` already uses for dependencies (`src/data/actions.ts:200`). That
  precedent is the strongest existing hook in the codebase; extending it is cheap and idiomatic.
- Add a pure `pickRunner(requirements, pool): { runner, rationale }` in `packages/domain` or a new
  `packages/distributor`. No infrastructure needed — it is a testable function.
- Show `runnerId` + `runnerClass` + a one-line rationale on every run row
  (`src/components/RunRow.tsx`, `ActivityView`): *"lightweight-3 — API-only, OAuth client
  credentials."*

That one line on a run row **is** the demo of smart distribution, and it can ship long before a real
distributor exists.

### Gap 3 — The node catalogue is compiled in, contradicting "data-driven builder"

Vision §6: *"New node types appear in the builder by adding metadata, not by rewriting the canvas."*
Today `ACTIONS` is a hardcoded array in the frontend bundle (`src/data/actions.ts:41`) — a new node
type is a frontend edit plus a Pages redeploy.

The irony is that the **connector** layer already does this correctly: instances live in
`connector_instances` and types self-register via `defineConnector`. The builder is the one place
that still hardcodes its extension point.

**Change**
- Serve the node-type catalogue from the backend: a `node_types` table plus a `node-types` Edge
  Function, mirroring the existing `capabilities` function.
- Keep `ACTIONS` as the **seed fallback**, exactly as `seedBots()` backs `bots` today
  (`src/store.tsx:213`, `src/data/toDomain.ts`). One code path, backend or not — the pattern is
  already established and tested.
- Carry `requires` (Gap 2) and `execution` metadata on each node type, so adding a node type also
  teaches the distributor how to route workflows that use it.

### Gap 4 — The workflow schema is not versioned

Vision §6 names this explicitly: *"Workflow schema is versioned and extensible. Growth in workflow
capability doesn't require breaking older workflows."* `Automation` has no `schemaVersion` and
`steps` is a bare array (`src/data/types.ts:132,154`).

**Change:** add `schemaVersion: number` to `Automation`, a `migrateWorkflow(raw): Automation`
function with a test per version, and make the builder write the current version on save
(`commitDraft`, `src/lib/builder.ts:114`). Trivial now; expensive after the first real workflows exist.

**Related and more urgent than it looks:** the flow model is a **linear array of steps**. The vision's
API-first workloads are "HTTP calls, data transformations, **conditionals**, orchestration between
systems" (§3). A linear array cannot express a conditional, so the first genuinely useful workflow
will break the schema. Adding versioning *before* adding branching is the cheap ordering.

### Gap 5 — Tiers and the review lifecycle are absent

The vision's supporting bet is a three-tier model with a promotion workflow (§3, §6, Phase 3). The
app has `admin | developer | user` (`src/data/types.ts:80`) with descriptions written for an IT tool,
not for the vision's tiers (`src/data/admin.ts:31-35`), and a status enum with no review states.

**Change**
- Map roles to the vision's vocabulary: `consumer` (trigger + view outputs), `builder` (citizen —
  author and submit), `professional` (author, review, own production), `admin`. `user → consumer`
  and `developer → professional` are near-drop-in renames; `builder` is the new tier.
- Extend `AutomationStatus` into a lifecycle: `Draft → In review → Changes requested → Approved →
  Published → Paused`, with `submittedBy` / `reviewedBy` / `reviewedAt`.
- Build the review queue **on the existing Inbox chassis**. An inbox of submissions grouped by
  workflow state is structurally what the incident inbox already is (`src/components/Inbox.tsx`,
  board/list modes, `src/data/viewLayout.tsx:30`). This is the largest vision feature with the
  smallest UI cost, because the chassis exists.

### Gap 6 — No execution runtime, and the vision's Phase 0 depends on one

Vision §7 claims the prototype proves *"a stateless runtime can execute that workflow end-to-end"*
and *"the execution is observable in real time — nodes lighting up, logs streaming."* The app
fabricates runs (`src/lib/builder.ts:147`). The run-viewer UI itself is genuinely good — the
Activity view has in-progress grouping, live-run detection (`isLive`, `ActivityView.tsx:51`), a
timeline mode, and a per-run log feed. It is a real viewer pointed at fake events.

**Change — the minimum that makes the claim true:**
- `packages/runtime` — a dependency-free executor over the node-type interface, with an injected
  `EventSink` and `HttpTransport`, matching the seam pattern the A360 connector already uses
  (injected `HttpTransport` + `now()` clock). No Supabase import, so it runs **in an Edge Function
  and as a local CLI process** — which is what makes the cross-platform claim (§5, §6)
  demonstrable: same runtime, laptop and server.
- Six node types end-to-end, matching the vision's own count: `http.request`, `assert.equals`,
  `templates.render`, `records.query`, `metrics.record`, and **one conditional** (see Gap 4).
- A `run_events` table plus Supabase **Realtime**, so the Activity view subscribes and nodes light
  up live. The existing `ActivityEvent` shape (`src/data/types.ts:37`) is already the run-log
  format — the viewer needs a live source, not a rewrite.
- Be explicit in the runbook that Edge Functions are ~150 s and stateless. That is fine for the
  demo and is precisely why the vision's runner pool exists; say so rather than letting a reviewer
  find it.

**If a separate prototype repo already holds this runtime**, then Gap 6 is not a gap — but Conduit
must then be positioned as the control plane, not "the prototype", and §7 of the vision should name
both artefacts. See §6, Decision 1.

### Gap 7 — The AA-coexistence story is the app's strongest asset and is invisible

Phase 6 — *"workloads migrate off AA one at a time, reversibly; each workflow's routing decision is
per-workflow"* — is exactly what the connector layer was built for, and the UI never shows it. The
Automations library does not display `platform`; the Activity stream does not distinguish estates.

**Change**
- Surface `platform` as a column, filter, and chip on the Automations library and Activity stream
  (the filter/chip machinery already exists — `src/data/workspaceControls.tsx`, `src/lib/filterMenu.ts`).
- Add a per-workflow `migration: "Not started" | "Piloting" | "Migrated" | "Won't move"`.
- A rollup on Settings → Integrations or the estate view: *"142 workflows — 118 AA, 24 Conduit,
  6 won't move."*

This turns the vision's abstract strangler into a screen, and it makes the honest risk *"some
workloads never move"* (§10) a **visible count** rather than a caveat. That is the kind of thing a
CIO trusts.

### Gap 8 — The business case (§2) has nowhere to live in the UI

The vision's argument is arithmetic: ~30 % API-eligible now, ~20 % blocked by Windows-integrated
auth and shrinking as Entra rolls out, ~50 % genuinely headed. No screen shows this, so the demo
cannot back the pitch.

**Change:** an **Estate / Readiness** view — or a tab on Activity, where an `Insights` tab already
exists (`src/components/ActivityView.tsx:15`) — classifying every workflow by
`requirements.auth` + `requirements.ui` (free once Gap 2 lands) into: *API-eligible now* /
*Windows-auth, Entra-pending* / *headed-bound*, with a runner-class cost rollup.

Once `requirements` exists this is nearly free, and it is plausibly **the single most CIO-legible
screen in the product**. It also makes the *"Entra migration pace is not ours to set"* risk (§10)
something you track on a chart instead of something you apologise for in a meeting.

### Gap 9 — Vocabulary drift across three registers

UI says "Automation", the domain says `Bot`, the vision says "workflow". `CLAUDE.md` decision 4
settled UI = Automation / domain = `Bot`, which was right **for an integration layer** — `bot` is
A360's word for A360's object.

Under this vision they are genuinely two different objects with different lifecycles: a `Bot` is
*their* estate normalised for us to observe; a `Workflow` is *ours*, authored in our builder, with
requirements, a schema version, and a review state. Conflating them is what makes the naming hurt.

**Change:** keep `Bot` as the **connector-facing** capability type. Introduce `Workflow` in
`packages/domain` as the **native** type. Consider moving the UI label from "Automation" to
"Workflow" — the vision document, which is the pitch artefact, says workflow throughout.

### Gap 10 — The prototype over-promises against the vision's own honesty

Vision §7 lists what the prototype deliberately does *not* prove: *"Scheduling, credentials,
notifications, multi-user auth (all roadmap)."* The app renders complete-looking surfaces for every
one of them — Manage → Scheduled (`src/data/manage.ts:23`), Credentials (`:63`), Administration →
licences and policies (`src/data/admin.ts:39,47`). A CIO clicking through will assume they work.

**Change:** a per-surface readiness affordance — `"live" | "prototype" | "roadmap"` — reusing the
`dataSource` seam that already distinguishes live from seed (`src/store.tsx:215`). A small badge in
the workspace header.

This is cheap, and it converts a credibility risk into a **demonstration of the same discipline the
vision preaches** in §7 and §9. Being explicit about limits is described in the vision as "a feature
of the pitch, not a weakness" — the app should embody that, not undercut it.

### Gap 11 — The capability set is entirely AA-shaped

`bots · schedules · devices · credentials · activity · audit · packages · queues`
(`packages/domain/src/capability.ts:6`). Capabilities gate the UI (`src/data/nav.ts:24`), so **no
vision feature can be capability-gated today** — there is no id to gate on.

**Change:** add `workflows`, `runners` (or re-point `devices`), `node-types`, `distribution`,
`review`. Let the `conduit` connector declare them, and let A360 continue declaring only `bots`. The
nav then lights up the native platform's features by exactly the mechanism the architecture already
mandates.

### Gap 12 — No AI extension point

Vision §6: *"AI capabilities plug in through the same node interface as everything else — not bolted
on, not a separate product."* There is no AI node and no seam, so the claim is untested.

**Change:** an `ai` package with two or three node types (extract from document, classify,
summarise) declared through the ordinary node-type interface and badged `roadmap` (Gap 10). The
point is to prove the interface holds, not to build the feature — the vision is explicit that AI
"should not lead the roadmap" (Phase 5). Keep it to three nodes.

### Gap 13 — Residual issue-tracker DNA

Some of the inherited chassis maps well and should stay: a failed run spawning an incident is real
observability, and `Issue.sourceRunId` already models it (`src/data/types.ts:73`). Some does not:
`Surfaces`, `impactedUsers`, `regression`, and code-diff findings are APM concepts with no vision
counterpart.

**Change:** keep Issues as run-failure incidents. Re-purpose **Surfaces → Systems** (the target
applications workflows touch, each with its auth model). That directly feeds the Entra-readiness
story — *"which target systems are still Windows-integrated"* — and reuses a built view instead of
deleting one.

---

## 4. Staged plan

Ordered so each stage is independently demonstrable, mirroring the vision's own "each phase delivers
standalone value" principle.

**Stage A — model and vocabulary** *(low risk, no UI churn, unblocks everything)*
1. `CLAUDE.md` product framing (Gap 0).
2. `Runner` + runner classes + `runners` capability (Gap 1, Gap 11).
3. `WorkflowRequirements` on `Automation`, `requires` on node types, derivation from steps (Gap 2).
4. `schemaVersion` + `migrateWorkflow` (Gap 4).
5. Tier roles + review lifecycle states (Gap 5, model only).

**Stage B — the screens that sell the bet** *(highest pitch value per hour)*
6. Environments → **Runners** pool view (Gap 1).
7. `pickRunner()` + routing rationale on every run row (Gap 2).
8. **Estate / Readiness** view — the §2 arithmetic (Gap 8).
9. `platform` column, filter, and migration state on the library (Gap 7).
10. Readiness badges on roadmap surfaces (Gap 10).

**Stage C — the proof**
11. `packages/runtime` — six node types, injected `EventSink`, runs locally and in an Edge Function (Gap 6).
12. `run_events` + Realtime → nodes light up live in the Activity view (Gap 6).
13. Node catalogue served from the backend, `ACTIONS` as seed fallback (Gap 3).
14. Review queue on the Inbox chassis + promote flow (Gap 5, UI).
15. Three AI node stubs behind the same interface (Gap 12).

If only one stage gets built, build **Stage B**: it needs no infrastructure, and it is what turns the
vision's three bets into three screens.

---

## 5. What not to build

Drawn from the vision's own §9 boundaries — worth stating so the app doesn't drift into them:

- **No integration marketplace.** Connectors are an internal extension point, not a catalogue with
  a browse-and-install UI.
- **No DAG/ETL semantics.** Fan-out, backfill, and data-lineage UI would make this read as Airflow.
  Business-process shape: a flow, conditionals, retries.
- **No general app builder.** The builder authors workflows; it must not grow forms, pages, or layout.
- **No cutover language anywhere in the UI.** AA coexists for the whole roadmap; every migration
  affordance should be reversible and per-workflow.
- **Do not let AI lead.** Three node stubs behind the standard interface. No AI-first surface, no
  assistant in the shell — the vision is explicit that this lands last and lands well only on a solid
  platform.

---

## 6. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Is Conduit the prototype the vision's §7/Phase 0 describes, or the control plane alongside a separate runtime prototype?** | Everything else follows from this. If Conduit is the prototype, Stage C is mandatory before the CIO demo, because §7's central claim is currently unsupported. If the runtime lives elsewhere, position Conduit as the control plane in `CLAUDE.md` and have the vision name both artefacts. |
| 2 | `Bot` vs `Workflow` in the domain | Keep both — `Bot` connector-facing, `Workflow` native (Gap 9). They are different objects. |
| 3 | UI label: "Automation" or "Workflow" | Move to **Workflow** if the vision doc is the pitch artefact; the two should not use different words for the same thing in front of a CIO. |
| 4 | `devices` capability vs a new `runners` capability | Re-point `devices` at runners and alias the label. A360 calls them devices; the vision calls them runners; one capability, two labels. |
| 5 | Environments view: repurpose or keep | **Repurpose to Runners.** Deployment environments are marketing-template DNA with no place in the vision. |
| 6 | Where the distributor lives | Start as a pure function in `packages/domain` (or `packages/distributor`). It is testable with no infrastructure, and it makes Phase 2 a swap of implementation, not of contract. |

---

*Companion documents: `docs/integration-layer-plan.md` (the integration layer as built),
`docs/structure-map.md` (the A360 ⇄ Conduit entity mapping).*
