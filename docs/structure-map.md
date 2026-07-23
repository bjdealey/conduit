# Conduit ⇄ a360 structure map

Analysis prepared before adding **automation monitoring, execution, and reporting** to
Conduit's existing incident-management prototype. No application code was written or
modified to produce this map; every claim is traceable to a cited file and line.

The reference platform is an Automation Anywhere A360-style Control Room, described only
by its surface navigation (the supplied reference material). Where that material is silent
about the reference's internals, this document says so rather than inferring them.

## Design decisions captured

These were settled with the product owner and drive the correspondence below:

1. **`Automation` is the first-class (root) entity.** `Issue` is demoted to a leaf that can
   be spun off the back of an automation failing.
2. **Two-entity split (definition vs run).** An `Automation` (definition, lives in a folder
   tree) has many `Run`s (execution instances). A failed `Run` can spawn an `Issue`. Chosen
   over collapsing runs into the automation's own timeline because runs are many-per-automation
   and a run is the unit that fails — and because this reuses two existing engines (see §D).
3. **Hierarchical foldering is in scope** (Public/Private folder trees).
4. **Activity is primarily automation runs, but includes a relevant incident feed** — a merge
   of two reference units into Conduit's existing `Activity` view.
5. **Users vary by permission**, gated by a **fixed role enum `admin | developer | user`** at
   the UI level (admin can edit permissions; developer and user get scoped/read views).
6. **`Issue.automationId` is optional.** An issue may originate from a failed `Run`, be raised
   manually against an automation, or stand alone. The failure→issue path is one source, not
   the only one.

## Target entity graph

```
Automation (definition; lives in a Folder tree, Public/Private scoped)   ← new root entity
   └── Run (execution instance; run-state lifecycle + append-only log)   ← new entity
          └── Issue (optional child; automationId?/sourceRunId? nullable) ← existing, demoted
```

The failure→issue bridge already exists conceptually: `ActivityKind: "problem"` /
"Problem detected" (`src/data/issues.ts:52-56`) is the event a failed `Run` raises to open an
`Issue`. `Issue` gains optional back-links (`automationId?`, `sourceRunId?`).

---

## A. Existing structure

Conduit is a single-page React/Vite/TS prototype with **no URL router** — the "route" is a
`view` string in a React context store, switched imperatively. No backend; all data is
in-memory seed data (`src/store.tsx:86`).

| Route / view | Owning module | Data it reads | Pattern |
|---|---|---|---|
| `view` enum (the router) | `src/store.tsx:26`; dispatched in `src/App.tsx:41-53` (`Body()`) | store state | State-as-route; no path/URL/history |
| Sidebar nav rail | `src/components/Sidebar.tsx:29`; list from `src/data/nav.ts:10-17` | `navItems`, derived badge counts `src/components/Sidebar.tsx:39-53` | Icon rail with data-driven count badges |
| Breadcrumb titlebar | `src/components/Titlebar.tsx:54`; `src/components/Breadcrumb.tsx:18` | current `view`/`subview`/`selected` | Two-level trail `Section › Page` (**depth capped at 2**) |
| **Inbox** (incidents) | `src/components/Inbox.tsx:8`; board variant `src/App.tsx:22-24`, `src/components/Board.tsx` | `issues` grouped by `Status` (`src/components/Inbox.tsx:19-28`) | Master–detail list **grouped by workflow status**; List/Board toggle (`src/components/Titlebar.tsx:12`) |
| **Issue detail** | `src/components/IssueDetail.tsx:62`; `src/components/MetadataPanel.tsx:92` | one `Issue` + `issue.activity[]` | Metadata pane + tabbed pane (**Activity / Sessions / Evidence**, `src/components/IssueDetail.tsx:10`); editable Priority/Assignee/Status via `updateIssue` (`src/store.tsx:217`) |
| **Activity** | `src/components/Views.tsx:10` (`ActivityView`) | derived feed from `issues[].activity[0]` | Flat recent-events feed (an *incident* feed today) |
| **Users** | `src/components/UsersView.tsx:469` | `src/data/users.ts` (`EndUser`, `UserSession`, `SessionEvent`) | 3-pane: list → profile → session history (filter chips, Sessions/Problems tabs) |
| **Surfaces** | `src/components/SurfacesView.tsx:213` | `src/data/surfaces.ts` (`Surface`, `Release`, `Integration`, `LogRow`) | Info pane + events chart + 10-min-bucket log table; tabs Events/Keys/Environments/Releases (last 3 empty) |
| **Environments** | `src/components/EnvironmentsView.tsx:79` | `src/data/environments.ts` | Grid of status cards (region, branch, release, deployed) |
| **Settings** | `src/components/SettingsPanel.tsx:324`; pages `src/data/settings.tsx:10-18` | `workspace`, `currentUser`, appearance prefs | Full-screen mode; rail replaced by settings nav (`src/components/SettingsRail.tsx`). Real: Profile, Workspace. **Placeholders**: Alerts, Integrations, Developer, Team, Billing (`src/components/SettingsPanel.tsx:314`) |
| Workspace switcher | `src/components/WorkspaceMenu.tsx`; `src/data/workspaces.ts:5` | `workspaces[]` | Dropdown; changes label only |
| Command palette (⌘K) | `src/components/CommandPalette.tsx:65` | nav targets + issue search | Global nav/search index mirroring the 6 views |
| Auth gate | `src/App.tsx:171` (`Shell`); `store.signIn/signOut` | `authed` flag | Any-credential local sign-in |

**Domain model** (`src/data/types.ts`): the central entity today is `Issue` (an
incident/"problem": `id, title, status, priority, assigneeId, surface[], regression,
firstDetection, latestDetection, duration, findingsCount, impactedUsers, activity[]`,
`src/data/types.ts:52-67`). Its lifecycle is a 4-state workflow
`STATUSES = ["Under Investigation","Active","In Recovery","Resolved"]` (`src/data/types.ts:6`),
and `ActivityEvent`/`ActivityKind` (`src/data/types.ts:18-50`) is an append-only timeline
(`problem/status/finding/fact/assignment/priority/comment/pr`). Supporting entities:
`Member` (team), `EndUser` (monitored user), `Surface`, `Environment`, `Workspace`.

Dominant reusable patterns: **entity-with-status-lifecycle + append-only activity timeline +
grouped master/detail list**; **status-card grids**; **info-pane + chart + log-table dashboards**.

## B. Reference structure

The reference organises into **five top-level sections**, each a container of **tabs**, each
tab a **table or folder view**, with per-row **detail / history / dependencies** drill-down:

- **Home** — landing dashboard: Overview, Automations, API Tasks, Devices, Licenses (summary tabs).
- **Automation** — automation *definitions*: **Public** / **Private** (each a folder tree + table,
  with **View history** and **View dependencies/references** tables); **Agentic App Store**.
- **Activity** — automation *runtime*: **In progress**, **Historical**, **Insights** (reporting).
- **Manage** — operational objects: **Scheduled**, **Event triggers**, Devices, Device pools
  *[Not Used]*, Queues *[Not Used]*, Global values, Credentials, OAuth Connections, OAuth Clients,
  Packages.
- **Administration** — Users, Roles, Licenses, Settings, Policies, Bot update.
- **User Account** — My settings, Log out.

Relationships between units: an **Automation** (Public/Private) is *scheduled or event-triggered*
(Manage) → produces **Activity** runs (In progress → Historical) → aggregated into **Insights**;
runs consume **Manage** objects (Credentials, Packages, Global values, Devices). Anything deeper
than tab + table + drill-down is **not determinable from supplied material**.

## C. Correspondence table

Relationship ∈ DIRECT MATCH · PARTIAL / EXTENDABLE · MERGE CANDIDATE · GENUINELY ABSENT ·
REFERENCE-ONLY.

| Reference unit | Nearest existing equivalent | Relationship | Evidence |
|---|---|---|---|
| Section → tabs → table nav model | `view` enum + flat sidebar; breadcrumb capped at 2 levels; unused `SubPage` type | PARTIAL / EXTENDABLE | `src/store.tsx:26`, `src/data/nav.ts:4-17`, `src/components/Titlebar.tsx:57-82` |
| Automation → Public / Private (folder tree + table) | none (no automation entity, no folder primitive) | GENUINELY ABSENT (largest new build; see §D) | `src/data/types.ts` (no automation type), `src/components/Inbox.tsx:19` (flat lists only) |
| Automation → View history | `IssueDetail` metadata + Activity timeline tab | PARTIAL / EXTENDABLE (append-only log is the run-log shape) | `src/components/IssueDetail.tsx:62`, `src/data/types.ts:18-50` |
| Automation → View dependencies / references | none | GENUINELY ABSENT | — |
| Automation → Agentic App Store | none | REFERENCE-ONLY (outside monitoring/execution/reporting scope) | reference material |
| Activity → In progress / Historical | Inbox: group-by-status master/detail list | MERGE CANDIDATE (same shell hosts run-state grouping; merges with incident feed per decision 4) | `src/components/Inbox.tsx:19-28`, `src/data/types.ts:6`, `src/store.tsx:217` |
| Activity → Insights (reporting) | `ActivityView` feed + `ImpactChart`/`SurfaceChart` | PARTIAL / EXTENDABLE (charts + feed exist; no aggregation layer) | `src/components/Views.tsx:10`, `src/components/ImpactChart.tsx`, `src/components/SurfaceChart.tsx` |
| Manage → Scheduled | none | GENUINELY ABSENT (no temporal concept) | — |
| Manage → Event triggers | none | GENUINELY ABSENT | — |
| Manage → Devices | `Environments` status-card grid | PARTIAL / EXTENDABLE (nearest "targets" grid; semantics differ) | `src/components/EnvironmentsView.tsx:79`, `src/data/environments.ts:4-17` |
| Manage → Credentials / OAuth Conn / OAuth Clients / Packages / Global values | Settings → Integrations / Developer (placeholders) | PARTIAL / EXTENDABLE (placeholder pages, no data) | `src/data/settings.tsx:14-16`, `src/components/SettingsPanel.tsx:314-320` |
| Manage → Device pools, Queues *[Not Used]* | — | REFERENCE-ONLY (marked unused) | reference material |
| Home → Overview / Automations / API Tasks / Devices / Licenses (landing) | none; app opens directly on Inbox | GENUINELY ABSENT (no dashboard landing) | `src/store.tsx:89` (`view="inbox"` default) |
| Administration → Users / Roles / Policies | none (Conduit `Users` = *end users*, not admins/roles) | GENUINELY ABSENT (needs role enum + platform-user surface; see §E) | `src/components/UsersView.tsx:469`, `src/data/users.ts:31` |
| Administration → Bot update | none | GENUINELY ABSENT | — |
| Administration → Licenses | Settings → Billing (placeholder) | PARTIAL / EXTENDABLE | `src/data/settings.tsx:17` |
| Administration → Settings | Settings → Workspace / Profile (real) | DIRECT MATCH | `src/components/SettingsPanel.tsx:81,195` |
| User Account → My settings / Log out | `UserMenu` + Settings + `signOut` | DIRECT MATCH | `src/components/Sidebar.tsx:122`, `src/store.tsx:213`, `src/components/SettingsPanel.tsx:195` |
| Issue lifecycle (implicit; incidents are Conduit-native) | `Issue` + `STATUSES` + `updateIssue` | DIRECT MATCH — demoted to a **leaf** of `Run` per decision 1, with optional parentage per decision 6 | `src/data/types.ts:52-67`, `src/store.tsx:217` |

## D. Merge and simplification candidates

Ranked by how much new code each avoids (most first).

1. **Activity › In progress + Historical → the existing Inbox status-grouping engine.** The
   "entity carries a status from an ordered enum; the list auto-groups and re-groups on
   mutation" machine already exists (`src/components/Inbox.tsx:19-28`, `STATUSES`
   `src/data/types.ts:6`, `updateIssue` `src/store.tsx:217`). A `Run` is an entity with a
   run-state lifecycle (`Queued/Running/Completed/Failed`); point the same grouped-list +
   Board/List toggle at a `Run` collection instead of building a monitoring table. Per decision
   4 this same view also carries the related incident feed (`src/components/Views.tsx:10`) as a
   secondary stream. Avoids an entire list/grouping/detail subsystem.
2. **Run detail / View history → the `IssueDetail` timeline.** `ActivityEvent`/`ActivityKind`
   (`src/data/types.ts:18-50`) is already a typed, timestamped, append-only event log with an
   inline code-diff renderer — structurally a run/execution log. Reuse the metadata-pane +
   tabbed-pane shell (`src/components/IssueDetail.tsx:62`); add run-specific `ActivityKind`s
   rather than a new component.
3. **Manage supporting objects → the Settings placeholder pages.** Credentials, OAuth,
   Packages, Global values map onto the already-scaffolded but empty Settings pages
   (`src/data/settings.tsx`, `src/components/SettingsPanel.tsx:314`) — tables of config on a
   built settings rail + page shell.
4. **Insights (reporting) → existing chart primitives + `ActivityView`.**
   `ImpactChart`/`SurfaceChart` and the flat feed (`src/components/Views.tsx:10`) already render
   trends and recent events; Insights is a composition over `Run` data, not new charting.
5. **Manage › Devices → the `Environments` card grid.** If execution targets are modeled, the
   status-card grid (`src/components/EnvironmentsView.tsx`) is a ready host.
6. **User Account & Administration › Settings** already exist (DIRECT MATCH) — extend/relabel,
   no new structure.

Net: the automation-monitoring surface (Activity, run history, Insights) is largely a
**re-instantiation of the incident engine over new `Automation`/`Run` entities**, not a
greenfield build. The genuinely new work concentrates in two primitives (§E).

## E. Open questions

All five design questions from the prior analysis are now resolved (see "Design decisions
captured"). The remaining items are **build-shape flags**, not open decisions — recorded so the
implementation plan starts from them:

1. **Folder-tree primitive is new.** Nothing hierarchical exists — every current list is flat or
   status-grouped (`src/components/Inbox.tsx:19`), and the breadcrumb is hard-capped at two
   levels (`src/components/Titlebar.tsx:57-82`, `src/components/Breadcrumb.tsx`). Public/Private
   foldering (decision 3) needs a tree component, deeper breadcrumbs, and ownership scoping.
2. **RBAC is new but bounded.** The fixed `admin | developer | user` enum (decision 5) needs a
   `role` on `currentUser` (`src/data/user.ts`) and UI gates in `UsersView`
   (`src/components/UsersView.tsx:469`) — admin edits permissions; developer/user get scoped
   views. Conduit's existing `Users` view is *monitored end-users* (`src/data/users.ts:31`),
   which have no roles; the role-gated **platform-user / permissions** surface is therefore an
   addition alongside (not a replacement of) end-user monitoring.
3. **Additive, non-structural gaps.** Scheduling and Event-triggers (Manage) have no temporal
   concept anywhere today; they are new leaf features but do not reshape the entity graph.
