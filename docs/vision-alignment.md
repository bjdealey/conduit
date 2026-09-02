# Vision alignment — Conduit as the Control Room replacement

> ⚠️ **Superseded on the A360 question (historical document).** Conduit no longer ships an
> Automation Anywhere connector, and no vendor is named in the product. The `automation-anywhere`
> platform value, the `connectors/automation-anywhere` package and the mirrored seed estate were
> all removed; `WorkflowPlatform` is now an open `string` the UI reads off the data. The
> *mechanism* described here — pluggable connectors, capability services, the instance registry —
> is unchanged and still current. This document is kept as a record of the reasoning at the time;
> read `CLAUDE.md` § "Vendor independence" for what is true now.

An assessment of the Conduit application against the **Automation Platform — Vision** document
(IT Director / CIO audience), with the product framing settled: **Conduit is the replacement for
the Automation Anywhere Control Room.** Every claim about the current app cites a file and line.

> **Status.** This began as a proposal. Stages A and B are now built, along with the review
> lifecycle and the naming decision — the parity table and gap list below are marked accordingly.
> What remains is listed in §5 and §7.

---

## 1. The settled framing

Conduit is the **control plane** of the new platform — the screen the automation team lives in,
replacing AA's Control Room. It is not the runtime. That splits the vision's architecture into
three artefacts with clean boundaries:

| Plane | What it owns | Where it lives |
|---|---|---|
| **Control plane — Conduit** | Authoring, the library, versions and review, scheduling, **distribution**, the runner pool, credentials, node types, activity, audit, tiers and governance | This repo |
| **Execution plane — runners** | Executing a workflow and reporting events. Stateless, ephemeral, cross-platform | Separate artefact; the vision's Phase 0 runtime is runner #1 |
| **Migration bridge — connectors** | Normalising other platforms (AA first) into Conduit's domain so both estates render through one UI | `packages/connector-sdk`, `connectors/*` |

This framing was already in the repo, unstated: `docs/structure-map.md` maps the Control Room's
five sections onto Conduit's views, and the app's whole shape — `Automation → Run → Issue`,
Activity's *In progress / Historical / Insights*, Manage's tabs, Administration — comes from that
map. **The AA-shaped structure is deliberate parity work, not drift.** (My first pass read it as
drift; that was wrong, and it changes the ranking below.)

### The strategic consequence worth putting in the pitch

**Conduit replaces the Control Room by first wrapping it.** Day 1, the A360 connector makes Conduit
a read-only mirror of the AA estate. As native workloads appear, they land in the same library, the
same Activity stream, the same audit log — distinguished only by a `platform` field. Migrating a
workload is a change of one attribute on one row, and it is reversible.

There is never a cutover, never a second tool to learn, and the vision's Phase 6 strangler stops
being a promise and becomes a filter on a list. That answers §9's *"not a full replacement for AA on
day one"* with an architecture instead of a caveat — and it makes the connector layer you have
already built strategically central rather than a side quest.

---

## 2. Control Room parity map

Every Control Room surface (`docs/structure-map.md` §B), scored three ways: **Parity** (AA is right,
match it), **Invert** (the vision says AA is *wrong* here — do the opposite deliberately), **Add**
(Conduit-native, no AA equivalent).

| Control Room surface | Stance | Conduit today | Verdict |
|---|---|---|---|
| Home → Overview / Automations / Devices / Licenses | Parity, re-cut | Built — pool, estate split, readiness mix, in-flight runs (`src/components/HomeView.tsx`) | ✅ **Delivered** |
| Automation → Public / Private folder tree | Parity | Built (`folders`, `visibility`, `src/data/automations.ts:12`) | ✅ |
| Automation → View history (versions) | Parity + review lifecycle | Absent — no version concept | ❌ **Missing** |
| Automation → dependencies / references | Parity | Built, and *derived* (`packagesForSteps`, `src/data/actions.ts:200`) | ✅ Better than AA |
| Workflow builder | Parity | Built, with conditionals (`src/components/WorkflowBuilder.tsx`) | ✅ |
| Activity → In progress / Historical / Insights | Parity | Built, incl. live-run detection (`ActivityView.tsx:51`) | 🟡 Real viewer, seed events |
| Manage → Scheduled | **Invert** — schedules request work; the distributor places it | `Schedule.target` removed; the column reads "Chosen at run time" | ✅ **Inverted** |
| Manage → Event triggers | Parity | Built (`src/data/manage.ts:44`) | ✅ |
| Manage → **Devices** | **Invert** — stateful assigned desktops → an ephemeral pool | `Runner` + the pool view, with no assign control anywhere (`src/components/RunnersView.tsx`) | ✅ **Inverted** |
| Manage → Device pools *(unused in AA)* | **Invert & elevate** — the pool is the whole point | The pool grouped by class, plus `pickRunner` placing per run | ✅ **Delivered** |
| Manage → Queues *(unused in AA)* | Defer | Capability id reserved, no UI | ✅ Correctly deferred |
| Manage → Credentials / OAuth | Parity, Vault-backed | Metadata-only model + Supabase Vault server-side | ✅ Strong |
| Manage → Packages | Parity → becomes **node types** | Table + palette, but compiled in (`src/data/actions.ts:41`) | 🟡 Not data-driven |
| Manage → Global values | Parity | Built (`src/data/manage.ts:103`) | ✅ |
| Administration → Users / Roles | **Invert** — one professional tier → three tiers | `consumer · builder · professional · admin` + a permission table (`packages/domain/src/review.ts`) | ✅ **Inverted** |
| Administration → Licenses | Parity | Built — already carries an "Automation runners" seat count (`src/data/admin.ts:41`) | ✅ |
| Administration → Policies | Parity | Built — already carries "Production run approval" (`src/data/admin.ts:51`) | ✅ Hook for review |
| Administration → Settings | Parity | Built | ✅ |
| Administration → Bot update (agent versions) | **Invert** — ephemeral runners don't drift; only images version | Absent | 🟡 Becomes "Runner images" |
| Audit log | Parity | Capability id reserved, no surface | ❌ **Missing** |
| Migration tool | **Invert** — per-workflow, reversible, always-on | `Workflow.migration` + platform/migration filters on the library | ✅ **Delivered** |
| Incident inbox | **Add** — AA has no equivalent | Built, with `Issue.sourceRunId` back-links (`src/data/types.ts:73`) | ✅ Differentiator |

**Original score: parity was in good shape; the inversions were almost entirely unbuilt.** That was
the finding, and it drove everything since. All three inversions now exist. What's left is parity
work Conduit still owes — versions, the audit surface — and the runner protocol that makes the
execution plane real.

---

## 3. The three inversions and one addition

This is the whole pitch, and it is what the demo has to make unmissable. Everything at parity is
table stakes — a CIO will not fund parity.

**Inversion 1 — Devices you assign → a pool you never assign to.**
AA: 16 named VMs, a human decides which bot goes where. Conduit: workflows declare requirements,
the distributor places them, nobody names a machine. *Demo moment:* a run row reading
*"lightweight-3 — API-only, OAuth client credentials"* where AA shows a hand-picked VM.

**Inversion 2 — Stateful agents that drift → ephemeral runners that can't.**
AA needs a Bot-update surface because agents accumulate state. Conduit has no such surface, by
construction. *Demo moment:* a pool view where runners appear, run, and vanish — and the honest
line that there is no drift to manage because there is nothing to drift.

**Inversion 3 — One professional tier → three tiers with a review lifecycle.**
AA: everything flows through the automation team. Conduit: consumers trigger, citizens build and
submit, professionals review and promote. *Demo moment:* a submission moving Draft → In review →
Published with an audit trail.

**Addition — the incident inbox.** AA tells you a bot failed. Conduit tells you why, links the run
that caused it, and tracks it to resolution. This already works and has no Control Room equivalent —
worth showing, and worth keeping out of the "parity" bucket where it gets undersold.

---

## 4. Gaps, re-ranked for the Control Room framing

### ~~Gap 1~~ — The runner pool ✅ **delivered** *(`packages/domain/src/runner.ts`, `RunnersView`)*

A runner is free text today: `target: "prod-runner-1"` (`src/data/manage.ts:24`,
`src/data/types.ts:113`). AA's Devices surface has no Conduit counterpart, and AA's *Device pools* —
marked unused in the reference material — is precisely the concept the vision elevates to central.

**Change**
- `Runner` in `packages/domain`, with the vision's three classes verbatim (§6):
  `lightweight | windows-service-account | windows-interactive`; plus `state`
  (`Idle | Busy | Starting | Draining | Offline`), `platform` (`linux | windows | macos`),
  `authModels: AuthModel[]`, `ephemeral: boolean`, `startedAt`, `currentRunId?`.
- A `runners` capability — or re-point the existing `devices` capability at it, since *devices* is
  simply AA's word for the same slot. One capability, two labels.
- **Repurpose the Environments view into the pool.** `Environment` (`src/data/environments.ts:4`)
  is deployment-platform DNA — branch, release, URL, `eventsPerMin` — from the marketing template,
  and `structure-map.md` §D.5 already nominated that card grid as the host for execution targets. It
  occupies the nav slot the pool should own (`src/data/nav.ts:21`).

### ~~Gap 2~~ — Requirements + the distributor ✅ **delivered** *(`packages/domain/src/distributor.ts`)*

Vision §6: *"A workflow declares its requirements (auth model, UI dependency, target platform), and
the distributor routes it to a runner that fits."* `Automation` (`src/data/types.ts:141`) has no such
field. Without it, Inversion 1 is undemonstrable and the Manage → Scheduled surface stays AA-shaped.

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
- Add matching `requires` metadata to each node type (`StepAction`, `src/data/actions.ts:26`) and
  **derive** the workflow's requirements from its steps — the exact pattern `packagesForSteps()`
  already uses for dependencies (`src/data/actions.ts:200`). That precedent is the best hook in the
  codebase and extending it is idiomatic and cheap.
- `pickRunner(requirements, pool): { runner, rationale }` as a **pure function** in
  `packages/domain` (or a `packages/distributor`). No infrastructure — a testable function, and
  Phase 2 later swaps the implementation, not the contract.
- Surface `runnerId`, `runnerClass`, and the one-line rationale on every run row
  (`src/components/RunRow.tsx`, `ActivityView`). That line **is** Inversion 1, and it ships long
  before a real distributor.

### ~~Gap 3~~ — Tiers and the review lifecycle ✅ **delivered**

*Built in `packages/domain/src/review.ts` (permission table + transition rules, 16 tests) and
`src/components/ReviewView.tsx` (the queue, on the Inbox chassis). Gates read `allowed(permission)`;
no `role === "…"` comparison survives in the app. Original analysis follows.*

Roles are `admin | developer | user` (`src/data/types.ts:80`) with descriptions written for an IT
tool (`src/data/admin.ts:31`). `AutomationStatus` is `Active | Paused | Draft`
(`src/data/types.ts:122`) — no review states.

**Change**
- Roles → the vision's tiers: `consumer`, `builder` (citizen), `professional`, `admin`.
  `user → consumer` and `developer → professional` are near-drop-in renames; `builder` is new.
- Lifecycle: `Draft → In review → Changes requested → Approved → Published → Paused`, with
  `submittedBy` / `reviewedBy` / `reviewedAt`.
- **Build the review queue on the Inbox chassis.** An inbox of submissions grouped by state is
  structurally what the incident inbox already is (`src/components/Inbox.tsx`, board/list modes,
  `src/data/viewLayout.tsx:30`) — the same reuse `structure-map.md` §D.1 made for run states.
- The `pol_approval` policy row already exists (`src/data/admin.ts:51`); wire it to the lifecycle
  instead of leaving it decorative.

### ~~Gap 4~~ — No Home ✅ **delivered** *(`src/components/HomeView.tsx`)*

The Control Room opens on a Home dashboard (Overview / Automations / Devices / Licenses); Conduit
opens on `inbox` (`src/store.tsx:201`). For a Control Room replacement this is a parity gap; for a
CIO demo it is a positioning failure — the first screen should answer *what is this and why is it
better* in five seconds.

**Change — a Home view carrying the vision's argument:**
- **Runner pool** — live count by class, idle vs busy, runners started and reclaimed today
  (Inversions 1 + 2).
- **Estate split** — *"142 workflows: 118 AA · 24 Conduit · 6 won't move"* (Phase 6, and it makes
  §10's *"some workloads never move"* an honest number rather than a footnote).
- **Readiness mix** — the §2 arithmetic: API-eligible now / Windows-auth, Entra-pending /
  headed-bound, classified automatically from `requirements` once Gap 2 lands. This is the single
  most CIO-legible thing you can build, and it makes the *"Entra pace is not ours to set"* risk
  something you track on a chart instead of apologise for in a meeting.
- **In-flight runs** — reusing the existing Activity primitives and `ImpactChart`/`SurfaceChart`.

### ~~Gap 5~~ — The runner protocol ✅ **delivered, and now implemented on both sides** *(`packages/domain/src/protocol.ts`; `claim` hands out real work, `runner/` executes it)*

My first draft recommended building `packages/runtime` inside Conduit. With the framing settled,
that is wrong: execution is not the control plane's job. What Conduit owes the runner is a
**contract**, and that contract is entirely missing.

**Change — the control-plane half of execution:**
- **Runner registration + heartbeat** — a runner announces `{ class, platform, authModels, version }`
  and heartbeats; the pool view (Gap 1) renders from it. This is also what makes Inversion 2 visible:
  runners appearing and vanishing on their own.
- **Work dispatch** — the distributor (Gap 2) assigns a run to a runner; a claim endpoint prevents
  double-execution.
- **Run-event ingestion** — a `run_events` table plus an ingest endpoint. The existing
  `ActivityEvent` shape (`src/data/types.ts:37`) is already the run-log format, so the viewer needs
  a live source, not a rewrite.
- **Live streaming** — Supabase Realtime on `run_events`, so nodes light up in the Activity view.
  Vision §7's *"nodes lighting up, logs streaming"* is then Conduit's half plus any runner that
  speaks the protocol.

Define the protocol as versioned TypeScript in `packages/domain` so the runtime team codes against
it. Until a real runner exists, `testRun()` (`src/lib/builder.ts:147`) can post through the same
ingest path — a fake runner rather than a fake screen, which means the UI is never rewritten.

**Stage 11 update — the fake runner is gone, replaced by a real one.** `packages/runtime` executes
the headless API-first node set (HTTP, assertions, values, conditionals, metrics) and emits the
protocol's events; `runner/` hosts it as a process that registers, claims, executes and ingests;
`runs` + `0009` queue a run and finish it. The prediction above held exactly: the viewer was not
rewritten, because the fake had always emitted the real shapes. What did change is that a node with
no executor now fails the run and says so, rather than a log line implying it ran.

### ~~Gap 6~~ — The node catalogue ✅ **delivered** *(`node_types` + the `node-types` function; `ACTIONS` is the fallback)*

Vision §6: *"New node types appear in the builder by adding metadata, not by rewriting the canvas."*
`ACTIONS` is a hardcoded array in the frontend bundle (`src/data/actions.ts:41`), so a new node type
is a frontend edit and a Pages redeploy. This is also a Control Room parity gap: AA's Packages are
installed into the Control Room at runtime, not compiled into its UI.

**Change:** serve the catalogue from the backend (a `node_types` table + a `node-types` Edge
Function, mirroring `capabilities`), keeping `ACTIONS` as the seed fallback exactly as `seedBots()`
backs `bots` today (`src/store.tsx:213`, `src/data/toDomain.ts`). One code path, backend or not.
Carry `requires` (Gap 2) on each node type, so adding a node type also teaches the distributor how
to route workflows that use it.

### ~~Gap 7~~ — Versions ✅ **delivered** *(`packages/domain/src/version.ts`; conditionals still absent)*

Two related holes. **Workflow versions:** the Control Room's *View history* has no Conduit
counterpart, and the review lifecycle (Gap 3) is meaningless without one — promotion promotes a
version. **Schema version:** `Automation` has no `schemaVersion` and `steps` is a bare array
(`src/data/types.ts:154`), against vision §6's *"workflow schema is versioned and extensible."*

**Change:** `version: number` + an immutable version history per workflow; `schemaVersion: number` +
`migrateWorkflow(raw)` with a test per version, written on save (`commitDraft`, `src/lib/builder.ts:114`).

✅ **Delivered — schema v2 makes the flow a tree.** Original note: the flow model was a **linear array**. Vision §3 promises conditionals.
A linear array cannot express one, so the first genuinely useful API workflow breaks the schema.
Version it *before* you branch it.

### ~~Gap 8~~ — Audit log ✅ **delivered** *(`packages/domain/src/audit.ts`, `AuditView`)*

`Capability.Audit` is reserved (`packages/domain/src/capability.ts:12`) with no surface. A Control
Room replacement needs one for parity, and the tiered model needs it for governance — who submitted,
who approved, who promoted, who ran. The `ActivityEvent` timeline is the right primitive again.

### ~~Gap 9~~ — Migration ✅ **delivered**

Add `migration: "Not started" | "Piloting" | "Migrated" | "Won't move"` per workflow, and surface
`platform` as a column, filter, and chip on the library and Activity stream — the filter/chip
machinery already exists (`src/data/workspaceControls.tsx`, `src/lib/filterMenu.ts`). This is the
Control Room's Migration tool, inverted: per-workflow, reversible, always-on.

### ~~Gap 10~~ — Vocabulary ✅ **settled and shipped: `Workflow` everywhere**

Three registers today: the UI says **Automation**, the domain says **`Bot`**
(`packages/domain/src/models.ts:31`), the vision says **workflow** throughout. `CLAUDE.md`
decision 4 settled UI=Automation / domain=`Bot`, which was right for an integration layer — `bot` is
A360's word for A360's object.

It is wrong for a Control Room *replacement*. Conduit's library shows AA bots and native workflows in
one list, so they must be one type — and that type should not be named after the thing being
replaced.

**Recommendation:** one word everywhere, and make it the vision's: `Workflow` in the domain,
`workflows` capability, "Workflows" in the UI. AA bots normalise into `Workflow` with
`platform: "automation-anywhere"`. Cost is ~10 files, all stage 1–4 code (`Bot`, `BotService`,
`BotProvider`, the `bots` table/function, `getBots`, `coerceBot`, `seedBots`, the nav gate) — a
mechanical rename, cheap now and steadily more expensive as capabilities land.
*Counter-argument worth weighing:* "Automation" is the more familiar business word and matches AA's
own section name. Either choice is defensible; **using two is not.**

### ~~Gap 11~~ — The prototype over-promises ✅ **delivered** *(`src/data/readiness.ts`)*

Vision §7 lists what the prototype deliberately does not prove — *"scheduling, credentials,
notifications, multi-user auth (all roadmap)"* — while the app renders complete-looking surfaces for
every one (`src/data/manage.ts:23,63`, `src/data/admin.ts:39,47`). A CIO clicking through assumes
they work.

**Change:** a per-surface `readiness: "live" | "prototype" | "roadmap"` badge, reusing the
`dataSource` seam that already distinguishes live from seed (`src/store.tsx:215`). Cheap, and it
makes the app embody the same discipline §7 and §9 preach rather than undercut it.

### Gap 12 — Two smaller alignments

- ~~**AI extension point**~~ ✅ **delivered** — three stubs, `readiness: "roadmap"`. (§6: *"AI plugs in through the same node interface"*). Three node stubs —
  extract from document, classify, summarise — declared through the ordinary node-type interface and
  badged `roadmap`. The point is proving the interface holds, not building the feature; §8 is
  explicit that AI lands last.
- **Surfaces → Systems.** `Surfaces` is APM DNA with no Control Room or vision counterpart.
  Re-purposed as the *target systems* workflows touch, each with its auth model, it directly feeds
  the Entra-readiness story — *which systems are still Windows-integrated* — and reuses a built view
  instead of deleting one.

---

## 5. Staged plan

**Stage A — model and vocabulary** *(low risk, no UI churn, unblocks everything)* — ✅ **delivered**
1. `CLAUDE.md` product framing: control plane / execution plane / migration bridge (§1).
2. `Runner` + classes + `runners` capability (Gap 1).
3. `WorkflowRequirements` + node `requires` + derivation from steps (Gap 2).
4. Tier roles + review lifecycle states (Gap 3, model only).
5. `version` + `schemaVersion` + `migrateWorkflow` (Gap 7).
6. Naming decision, applied in one pass (Gap 10).

**Stage B — the screens that sell the inversions** *(highest pitch value per hour; no infrastructure)* — ✅ **delivered**
7. **Home** — pool, estate split, readiness mix, in-flight runs (Gap 4).
8. Environments → **Runners** pool view (Gap 1).
9. `pickRunner()` + routing rationale on every run row (Gap 2).
10. `platform` column/filter + migration state (Gap 9).
11. Readiness badges (Gap 11).

**Stage C — the control plane earns its name** — ✅ **delivered in full.** Atomic dispatch, autoscaling and conditionals landed in stage 8.
12. Runner protocol: register, heartbeat, dispatch, claim (Gap 5).
13. `run_events` + ingest + Realtime → nodes light up live (Gap 5).
14. Review queue on the Inbox chassis + promote flow (Gap 3, UI).
15. Version history + audit log (Gaps 7, 8).
16. Node catalogue served from the backend (Gap 6).
17. Three AI node stubs (Gap 12).

If only one stage gets built before the pitch, build **Stage B**: it needs no backend work, and it
is what turns the three inversions into three screens.

---

## 6. What not to build

From the vision's own §9 boundaries, plus the framing:

- **No integration marketplace.** Connectors are an internal extension point, not a browsable catalogue.
- **No DAG/ETL semantics.** Fan-out, backfill, and lineage UI would make this read as Airflow.
- **No general app builder.** The builder authors workflows — not forms, pages, or layouts.
- ~~**No execution engine in this repo.**~~ **Amended in stage 11, deliberately and with the boundary
  intact.** The rule was about the *control plane* not becoming a runtime, and it still holds: nothing
  under `src/` executes anything, and no capability service, view or store knows how a step runs. What
  the repo now also *contains* is the execution plane's first artefact — `packages/runtime` (the
  engine) and `runner/` (its host) — which import `@conduit/domain` and nothing else, and would move
  to the runtime team's repository without the control plane noticing. The judgement: a protocol with
  no implementation is a claim, and the vision's Phase 0 runtime is runner #1. **If that separation
  ever erodes — a `src/` import inside `packages/runtime`, a node executor reaching for the store —
  the rule has been broken in the way it was written to prevent.**
- **No cutover language anywhere in the UI.** Every migration affordance is per-workflow and reversible.
- **Do not let AI lead.** Three stubs behind the standard interface. No assistant in the shell.
- **Do not copy AA where the vision says it is wrong.** A device-assignment UI, a bot-update surface,
  or per-machine scheduling would each quietly re-import the problem the platform exists to remove.

---

## 7. Decisions remaining

| # | Decision | Recommendation |
|---|---|---|
| 1 | ~~Is Conduit the prototype or the control plane?~~ | **Settled: the control plane — the Control Room replacement.** |
| 2 | ~~One word for the central object (Gap 10)~~ | **Settled and shipped: `Workflow` everywhere** — UI, domain, API, cache table, Edge Function, id prefix. `bot` survives only inside the A360 adapter. |
| 3 | `devices` capability vs a new `runners` capability | Re-point `devices` and relabel. AA says devices, the vision says runners; one capability, two labels. |
| 4 | Environments view: repurpose or keep | **Repurpose to Runners** — `structure-map.md` §D.5 already nominated it. |
| 5 | Where the distributor lives | A pure function in `packages/domain` now; a service in Phase 2. Contract stays, implementation swaps. |
| 6 | Does the runner protocol ship before a real runner exists? | **Yes** — define it in `packages/domain` and have `testRun()` post through the ingest path as a fake runner, so the UI is written once. |
| 7 | Does the incident inbox stay in scope? | **Yes** — it is the one genuine addition over the Control Room, and it already works. |

---

*Companion documents: `docs/integration-layer-plan.md` (the integration layer as built),
`docs/structure-map.md` (the Control Room ⇄ Conduit surface mapping that shaped the app).*
