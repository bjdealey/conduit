# Conduit — platform (interactive prototype)

A working reproduction of the product UI shown in the marketing site's hero/feature
mockups: an issue-tracker / observability tool. Standalone Vite + React + TS app,
reusing the marketing site's design system so it matches the mockup exactly.

## Run

```bash
npm install
npm run dev      # http://localhost:5174  (use a wide window; it's a desktop UI)
npm run build    # tsc + vite build
npm test         # Vitest: the domain, the engine, the runner, and the app's seams
```

## Run a workflow

Workflows execute for real, headless, over HTTP — in the app (the builder's **Test run**, the
library's **Run now**) and from the command line:

```bash
node runner/src/cli.ts run runner/examples/invoice-check.json \
  --env API_URL=https://api.example.com --env API_TOKEN=<a token>
```

The engine lives in `packages/runtime` and its host in `runner/` — the execution plane, kept as a
separate artefact from the control plane this repo is. See `runner/README.md`.

## What works

- **Command palette (⌘K)** — a universal search in the sidebar (first item under
  the logo; a search-input with a ⌘K hint when expanded, an icon when collapsed).
  Opens a centered modal (`src/components/CommandPalette.tsx`) with grouped
  results — Quick start (toggle theme / background), Navigation (go to any view),
  and live **issue search** — with arrow-key navigation, Enter to run, Esc/backdrop
  to close, and a smooth open/close transition. Also opens via ⌘K / Ctrl+K.
- **Breadcrumb titlebar** — a consistent header (Home › Section › Page) across
  every view, with a home icon, chevron separators, and clickable crumbs for
  traversal (e.g. the Inbox crumb clears the current issue; Home returns to the
  inbox). Issue subscribers show on the right when an issue is open.
- **Sidebar** — clickable nav rail that switches the main view (Inbox,
  Notifications, Team, Projects, Settings), with an expand/collapse toggle
  (in the titlebar) that widens the rail to show labels next to each icon.
  Collapsed items show a hover tooltip with the page title; the selected item
  renders as a white "card". Data-driven **count badges** appear on each item —
  as a corner badge on the icon when collapsed, and an inline right-aligned pill
  when expanded.
- **Subpages** — pages can have subpages (`src/data/nav.ts`; Team → Members /
  Invitations, Projects → Active / Archived). Expanded, a chevron toggles an
  indented subpage list; collapsed, hovering a page that has subpages shows a
  flyout menu of them (pages without subpages show the usual name tooltip). The
  active subpage appears in the breadcrumb (e.g. Projects › Archived).
- **Workspace switcher** — clicking the sidebar logo opens a dropdown of
  workspaces (`src/data/workspaces.ts`); selecting one updates the logo mark,
  wordmark, and the Settings view. Current workspace is checkmarked.
- **Account menu** — an avatar (with an online status dot) pinned to the bottom
  of the rail; clicking it opens a popover with the user header and grouped
  options (Account settings / Workspace / Documentation, Pinned issues / Invite
  teammates, Log out). Closes on outside-click or Escape.
- **Animated background** — a React Bits **Grainient** WebGL gradient
  (`src/components/Grainient`, needs `ogl`) rendered fixed behind everything
  (`src/components/Background.tsx`). The workspace shell is a semi-transparent
  scrim (`color-mix(... var(--color-shell) 55% ...)` in `App.tsx`) when it's on, so
  the gradient shines through the sidebar + padding frame while the opaque main
  card covers it (solid shell when off). Strongest in dark mode.
- **Appearance settings** (Settings view) — an on/off switch for the animated
  background, and a **colour-theme picker** (`src/data/palettes.ts`: Violet, Ocean,
  Aqua, Forest, Sunset, Rose). Each palette sets both the Grainient gradient
  colours and the app's accent (brand) tokens together (`src/lib/palette.ts`
  remaps `--color-brand-*` to the accent scale). Both prefs persist in
  localStorage (store: `backgroundEnabled`, `paletteId`).
- **Theme toggle** — a single sun/moon button beside the account avatar that
  animates (rotate + crossfade) between light and dark on click. Dark mode is the
  built-in `.dark` token palette from globals.css; the choice persists in
  localStorage and is applied before paint (no flash). `src/styles/theme.css` is
  scoped to `:root:not(.dark)` so its light reskin doesn't shadow the dark tokens
  — to customise dark colours, add a `.dark { … }` block there.
- **Open pages** — opening an issue pins it below a divider in the sidebar as a
  colour-coded icon (by assignee). These persist as you navigate to other views;
  click one to reopen it, or hover and press × to close/unpin (closing the active
  one falls back to a neighbour).
- **Inbox** — issues grouped by workflow status (Under Investigation / Active /
  In Recovery / Resolved), with live search/filter by title or id.
- **Other views** — Team (member directory with assigned-issue counts),
  Notifications (recent activity feed; click through to the issue), Projects
  (issues grouped by surface), Settings (workspace summary). All built from the
  same data.
- **Navigation** — click any issue to open its detail.
- **Issue detail** — summary (icon, id, title, description) + a metadata panel.
- **Editable fields** — Priority, Assignee and Status are dropdowns; changing one
  updates the shared store, so e.g. changing a Status live-regroups the inbox and
  changing a Priority updates its inbox row instantly.
- **Activity panel** — Activity / Sessions / Findings tabs; the Activity timeline
  renders the events from the mockup, including the `auth/reset.ts` code diff.

State is in-memory (resets on reload) — this is a prototype, no backend.

## Structure

```
src/
  main.tsx, App.tsx        # entry + workspace shell (Sidebar | active view)
  store.tsx                # React context store: issues, selection, search, view, mutations
  data/
    types.ts               # domain model (Issue, Member, ActivityEvent, …)
    issues.ts              # seed data reproduced from the mockups
  components/
    Sidebar, Inbox, IssueRow, Views,
    IssueDetail, MetadataPanel, ActivityFeed, CodeDiff,
    Avatar, Badges
  lib/format.ts
  styles/
    globals.css, theme.css # shared design system (copied from the marketing template)
    app.css                # a few app-specific helpers
```

## Icons

All UI icons use [`lucide-react`](https://lucide.dev) (imported per-icon so they
tree-shake). The only hand-drawn SVG left is the Conduit brand mark in
`WorkspaceMenu.tsx` (a logo, not a UI icon).

## Design system

`globals.css` + `theme.css` are the same compiled Radix + Tailwind v4 token layer
the marketing site uses, so colours/typography/spacing match. Components use those
token-backed utility classes (`bg-page`, `text-primary-foreground`,
`border-border-default`, `font-departure-mono`, …) and CSS variables
(`var(--cyan-a3)`, `var(--tomato-9)`, …) for accents. To reskin, edit
`src/styles/theme.css` — same as the marketing template.

## Not included (prototype scope)

Sessions/Findings tab contents (empty states), creating/deleting issues, comments,
and persistence — this is the "interactive prototype on seed data" scope. The store
(`store.tsx`) is the place to extend if you want CRUD or localStorage later.
