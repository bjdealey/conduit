import { type ReactNode } from "react";
import { Building2, ChevronDown, Globe, Plus } from "lucide-react";
import { useStore } from "../store";
import { Switch } from "./Switch";
import { DataTable, type Column } from "./DataTable";
import { Button } from "./Button";
import { TabStrip } from "./TabStrip";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { LIBRARY_DENSITIES, LIBRARY_LAYOUTS } from "../data/libraryView";
// `Credential` also names a DOM global, so these are imported explicitly rather
// than left to resolve — an unimported `Credential[]` silently means the browser's.
import type { Credential, GlobalValue, Package } from "../data/manage";
import { ROLES, ROLE_BLURB, ROLE_LABEL, type Workflow } from "@conduit/domain";

/* ---------------------------------------------------------------------------
   Shared form primitives
   --------------------------------------------------------------------------- */

function Divider() {
  return <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />;
}

/** Label-left / control-right settings row. */
/** Label beside its control. On a phone the two stack instead: a 160px label
 *  column and a 32px gutter leave ~150px for the control itself, which is less
 *  than a role switcher or an email field needs. See `.settings-row` in app.css. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-row flex gap-8 py-5">
      <div className="w-40 shrink-0 pt-1.5">
        <span className="text-body-sm font-medium text-primary-foreground">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A settings text field.
 *
 * Pass `value` + `onChange` for a field that actually saves, or `defaultValue` for
 * one that doesn't yet. The distinction is deliberate rather than incidental: most
 * of this page is still shaped-not-wired, but the profile is real, and a field
 * that silently discards what you typed is worse than one that is visibly inert.
 */
function TextInput({
  defaultValue,
  value,
  onChange,
  placeholder,
  type,
  prefix,
  mono,
}: {
  defaultValue?: string;
  value?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex items-center rounded-lg border-border-strong border-[0.5px] bg-page">
      {prefix && <span className="pl-3 text-body-sm text-tertiary-foreground">{prefix}</span>}
      <input
        type={type}
        placeholder={placeholder}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        className={
          "min-w-0 flex-1 bg-transparent px-3 py-2 text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground " +
          (mono ? "font-departure-mono" : "")
        }
      />
    </label>
  );
}

function SecondaryButton({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className="pressable focusable flex shrink-0 items-center gap-1.5 rounded-lg border-border-strong border-[0.5px] bg-page px-3 py-1.5 text-body-sm font-medium text-primary-foreground transition-colors hover:bg-transparent-hover"
    >
      {icon}
      {children}
    </button>
  );
}

function GhostButton({ children }: { children: ReactNode }) {
  return <Button variant="ghost">{children}</Button>;
}

/**
 * A segmented picker for a small closed set, with the chosen option's sentence
 * underneath.
 *
 * The blurb is part of the control, not decoration: every one of these settings
 * has a consequence worth one line — which tier you are pretending to be, what a
 * flat list gives up — and a row of three unexplained words makes the reader
 * guess it.
 */
function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string; blurb?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const chosen = options.find((o) => o.id === value);
  return (
    <div className="flex flex-col gap-2 pt-0.5">
      <div className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-component p-0.5">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className="pressable focusable rounded-md px-3 py-1 text-body-sm font-medium transition-colors"
              style={{
                background: active ? "var(--color-page)" : "transparent",
                color: active ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
                boxShadow: active ? "var(--s-default)" : "none",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {chosen?.blurb && <span className="text-body-sm text-tertiary-foreground">{chosen.blurb}</span>}
    </div>
  );
}

/** Centred page column. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-2">
      <div className="mx-auto flex max-w-3xl flex-col pb-16">{children}</div>
    </div>
  );
}

const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

/* ---------------------------------------------------------------------------
   Workspace details
   --------------------------------------------------------------------------- */

function WorkspaceDetailsPage() {
  const { workspace } = useStore();
  return (
    <Page>
      {/* Logo */}
      <div className="flex items-center gap-5 py-6">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-standout">
          <Building2 size={28} strokeWidth={1.6} style={{ color: "var(--color-page)" }} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col">
            <span className="text-body-sm font-medium text-primary-foreground">Workspace logo</span>
            <span className="text-body-sm text-tertiary-foreground">PNGs, JPEGs and GIFs under 10MB</span>
          </div>
          <div className="flex items-center gap-1">
            <SecondaryButton>Change logo</SecondaryButton>
            <GhostButton>Remove logo</GhostButton>
          </div>
        </div>
      </div>

      <Divider />
      <Row label="Name">
        <TextInput defaultValue={workspace.name} />
      </Row>
      <Row label="Slug">
        <TextInput prefix="conduit.com/~/" defaultValue={slugify(workspace.name)} mono />
      </Row>

      <Divider />
      <Row label="Domains">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <p className="text-body-sm text-secondary-foreground">
              Allow users to join the organization automatically or request to join based on verified email domain.
            </p>
            <SecondaryButton icon={<Plus size={15} strokeWidth={2} />}>Add domain</SecondaryButton>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-component px-3 py-2.5">
            <span className="flex items-center gap-2">
              <Globe size={15} strokeWidth={1.8} className="text-tertiary-foreground" />
              <span className="text-body-sm text-primary-foreground">interfe.re</span>
            </span>
            <button
              type="button"
              className="focusable flex items-center gap-1 rounded-md px-1.5 py-0.5 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
            >
              No automatic enrollment
              <ChevronDown size={15} strokeWidth={1.8} className="text-tertiary-foreground" />
            </button>
          </div>
        </div>
      </Row>

      <Divider />
      <Row label="Support access">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-component px-2 py-1 text-body-sm font-medium text-secondary-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--gray-9)" }} />
              Disabled
            </span>
            <SecondaryButton>Manage</SecondaryButton>
          </div>
          <p className="text-body-sm text-tertiary-foreground">
            Allow Conduit support temporary access to your account so we can troubleshoot problems as if we were you.
            You can revoke access at any time.
          </p>
        </div>
      </Row>

      <Divider />
      <DangerZone />
    </Page>
  );
}

function DangerRow({ title, desc, action }: { title: string; desc: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex min-w-0 flex-col">
        <span className="text-body-sm font-medium text-primary-foreground">{title}</span>
        <span className="text-body-sm text-tertiary-foreground">{desc}</span>
      </div>
      <button
        type="button"
        className="pressable focusable shrink-0 rounded-lg px-3 py-1.5 text-body-sm font-medium transition-colors"
        style={{ color: "var(--tomato-a11)" }}
      >
        {action}
      </button>
    </div>
  );
}

function DangerZone() {
  return (
    <div className="my-6 overflow-hidden rounded-xl border-[0.5px]" style={{ borderColor: "var(--tomato-a6)" }}>
      <div className="px-4 py-3" style={{ background: "var(--tomato-a2)" }}>
        <span className="text-body-sm font-medium" style={{ color: "var(--tomato-a11)" }}>
          Danger zone
        </span>
      </div>
      <DangerRow title="Leave workspace" desc="Remove yourself from workspace" action="Leave workspace" />
      <Divider />
      <DangerRow title="Delete workspace" desc="Once deleted, your workspace cannot be recovered" action="Delete workspace" />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Profile (personal details + appearance preferences)
   --------------------------------------------------------------------------- */

/** The tiers, in the order they gain permissions — so the picker reads as a ladder
 *  rather than a set of unrelated labels. */
const ROLE_OPTIONS = ROLES.map((id) => ({ id, label: ROLE_LABEL[id], blurb: ROLE_BLURB[id] }));

function ProfilePage() {
  const {
    backgroundEnabled,
    setBackgroundEnabled,
    bordersEnabled,
    setBordersEnabled,
    badgesEnabled,
    setBadgesEnabled,
    palettes,
    palette,
    setPaletteId,
    libraryLayout,
    setLibraryLayout,
    libraryDensity,
    setLibraryDensity,
    role,
    setRole,
    currentUser,
    updateProfile,
  } = useStore();
  return (
    <Page>
      <div className="flex items-center gap-5 py-6">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-full text-heading-4 font-medium"
          style={{ background: "var(--gray-4)", color: "var(--gray-11)" }}
        >
          {currentUser.initials}
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col">
            <span className="text-body-sm font-medium text-primary-foreground">Profile photo</span>
            <span className="text-body-sm text-tertiary-foreground">PNGs, JPEGs and GIFs under 10MB</span>
          </div>
          <div className="flex items-center gap-1">
            <SecondaryButton>Change photo</SecondaryButton>
            <GhostButton>Remove</GhostButton>
          </div>
        </div>
      </div>

      <Divider />
      {/* These two save. Conduit ships with no idea who you are — a fresh install
          takes its name from the address you signed in with, and this is where you
          correct it. The avatar's initials are derived from the name rather than
          entered, so they can't disagree with it. */}
      <Row label="Name">
        <TextInput
          value={currentUser.name}
          onChange={(name) => updateProfile({ name })}
          placeholder="Your name"
        />
      </Row>
      <Row label="Email">
        <TextInput
          type="email"
          value={currentUser.email}
          onChange={(email) => updateProfile({ email })}
          placeholder="name@work-email.com"
        />
      </Row>
      <Row label="Role">
        <Choice options={ROLE_OPTIONS} value={role} onChange={setRole} />
      </Row>

      <Divider />
      {/* The library's two reading preferences. They live with the appearance
          settings rather than in the library's own header because they are a
          standing choice about how you read the estate, not a control you reach
          for while working in it. */}
      <Row label="Library layout">
        <Choice options={LIBRARY_LAYOUTS} value={libraryLayout} onChange={setLibraryLayout} />
      </Row>
      <Row label="Library density">
        <Choice options={LIBRARY_DENSITIES} value={libraryDensity} onChange={setLibraryDensity} />
      </Row>

      <Divider />
      <Row label="Animated background">
        <div className="flex items-center justify-between gap-4 pt-0.5">
          <span className="text-body-sm text-tertiary-foreground">Show the gradient behind the app.</span>
          <Switch checked={backgroundEnabled} onChange={setBackgroundEnabled} label="Animated background" />
        </div>
      </Row>
      <Row label="Borders">
        <div className="flex items-center justify-between gap-4 pt-0.5">
          <span className="text-body-sm text-tertiary-foreground">Outline navigation items with a hairline border.</span>
          <Switch checked={bordersEnabled} onChange={setBordersEnabled} label="Borders" />
        </div>
      </Row>
      <Row label="Badge counts">
        <div className="flex items-center justify-between gap-4 pt-0.5">
          <span className="text-body-sm text-tertiary-foreground">Show count badges on the sidebar tabs.</span>
          <Switch checked={badgesEnabled} onChange={setBadgesEnabled} label="Badge counts" />
        </div>
      </Row>
      <Row label="Colour theme">
        <div className="flex flex-wrap gap-3">
          {palettes.map((p) => {
            const active = p.id === palette.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaletteId(p.id)}
                aria-pressed={active}
                className="focusable flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors"
                style={{
                  outline: active ? "2px solid var(--color-brand-border-focus)" : "0.5px solid var(--color-border-default)",
                  outlineOffset: active ? 1 : 0,
                }}
              >
                <span
                  className="rounded-lg"
                  style={{
                    width: 60,
                    height: 38,
                    background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]} 55%, ${p.gradient[2]})`,
                  }}
                />
                <span
                  className="text-body-sm"
                  style={{ color: active ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)" }}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </Row>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Resources — what a run consumes
   --------------------------------------------------------------------------- */

const RESOURCE_TABS = ["Credentials", "Packages", "Global values"] as const;
type ResourceTab = (typeof RESOURCE_TABS)[number];

/** What each tab says when it holds nothing. Per tab rather than one shared line:
 *  "Nothing to show yet" is true of all three and useful for none of them, and on
 *  a clean install every one of them starts empty. */
const EMPTY_RESOURCE: Record<ResourceTab, string> = {
  Credentials:
    "No credentials. Conduit stores a reference, never the secret — the value lives in the vault and is resolved server-side at run time.",
  Packages: "No packages. A package is a dependency a step pulls in; they are derived from the steps a workflow actually uses.",
  "Global values": "No global values. These are the workspace-wide settings runs read.",
};

function Kind({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-component px-1.5 py-0.5 text-[0.72rem] text-secondary-foreground">
      {children}
    </span>
  );
}

const monoCell = (s: ReactNode) => <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{s}</span>;

/**
 * Settings → Resources: the credentials, packages and global values a run reads.
 *
 * The back half of the old Manage page. Its front half (schedules and event
 * triggers) went to Workflows → Triggers, because these two groups were never one
 * idea: a trigger is *how a workflow starts*, these are *what a run consumes*.
 * Configuration is what Settings is for, so they land here rather than keeping a
 * destination of their own.
 *
 * Credentials are metadata only by contract — name, kind, scope, owner, last used.
 * No secret value reaches this table, or any other client surface.
 */
function ResourcesPage() {
  const { memberById, credentials, packages, globalValues, sectionTab, setSectionTab } = useStore();
  const tab = (sectionTab("settings") || RESOURCE_TABS[0]) as ResourceTab;

  const credentialCols: Column<Credential>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "kind", header: "Kind", width: 110, render: (r) => <Kind>{r.kind}</Kind> },
    { key: "scope", header: "Scope", render: (r) => monoCell(r.scope) },
    {
      key: "owner",
      header: "Owner",
      render: (r) => <span className="text-secondary-foreground">{memberById(r.ownerId)?.name ?? "—"}</span>,
    },
    { key: "used", header: "Last used", render: (r) => <span className="text-tertiary-foreground">{r.lastUsed}</span> },
  ];

  const packageCols: Column<Package>[] = [
    { key: "name", header: "Name", render: (r) => monoCell(r.name) },
    { key: "version", header: "Version", width: 100, render: (r) => monoCell(r.version) },
    { key: "publisher", header: "Publisher", render: (r) => <span className="text-secondary-foreground">{r.publisher}</span> },
    { key: "used", header: "Used by", align: "right", width: 90, render: (r) => `${r.usedBy} workflow${r.usedBy === 1 ? "" : "s"}` },
    { key: "updated", header: "Updated", render: (r) => <span className="text-tertiary-foreground">{r.updatedAgo}</span> },
  ];

  const globalCols: Column<GlobalValue>[] = [
    { key: "key", header: "Key", width: 220, render: (r) => monoCell(r.key) },
    {
      key: "value",
      header: "Value",
      render: (r) => (r.secret ? <span className="text-tertiary-foreground">••••••••</span> : monoCell(r.value)),
    },
    { key: "updated", header: "Updated", width: 160, render: (r) => <span className="text-tertiary-foreground">{r.updatedAgo}</span> },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TabStrip
        ariaLabel="Resources"
        segments={RESOURCE_TABS.map((t) => ({ id: t, label: t }))}
        value={tab}
        onChange={(id) => setSectionTab("settings", id)}
      />
      <div key={tab} className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-auto">
        <div className="min-w-[640px] px-3 py-2">
          {tab === "Credentials" && <DataTable columns={credentialCols} rows={credentials} empty={EMPTY_RESOURCE.Credentials} />}
          {tab === "Packages" && <DataTable columns={packageCols} rows={packages} empty={EMPTY_RESOURCE.Packages} />}
          {tab === "Global values" && (
            <DataTable columns={globalCols} rows={globalValues} empty={EMPTY_RESOURCE["Global values"]} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Integrations — live connector data plane (our API → our domain models)
   --------------------------------------------------------------------------- */

const BOT_STATE_ACCENT: Record<string, string> = {
  Running: "var(--color-success-solid)",
  Idle: "var(--color-tertiary-foreground)",
  Disabled: "var(--color-warning-solid)",
  Unknown: "var(--color-tertiary-foreground)",
};

/** The connectedWorkflows cache, rendered with the same table the Manage and Administration
 *  pages use — so a record list reads identically wherever it appears, and the
 *  rows carry real table semantics instead of being a grid of divs. */
const WORKFLOW_COLUMNS: Column<Workflow>[] = [
  {
    key: "title",
    header: "Title",
    render: (b) => <span className="truncate text-primary-foreground">{b.title}</span>,
  },
  {
    key: "state",
    header: "State",
    width: "8rem",
    render: (b) => (
      <span className="flex items-center gap-1.5 text-secondary-foreground">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: BOT_STATE_ACCENT[b.state] ?? BOT_STATE_ACCENT.Unknown }}
        />
        {b.state}
      </span>
    ),
  },
  {
    key: "platform",
    header: "Platform",
    width: "12rem",
    render: (b) => <span className="truncate font-departure-mono text-tertiary-foreground">{b.platform}</span>,
  },
  {
    key: "owner",
    header: "Owner",
    width: "10rem",
    render: (b) => <span className="truncate text-secondary-foreground">{b.owner}</span>,
  },
];

function IntegrationsPage() {
  const { connectedWorkflows, capabilities, dataSource, integrationError, demoData, setDemoData } = useStore();
  const live = dataSource === "live";

  return (
    <Page>
      <div className="flex items-center justify-between gap-4 py-6">
        <div className="flex flex-col">
          <span className="text-body-base font-medium text-primary-foreground">Integrations</span>
          <span className="text-body-sm text-tertiary-foreground">
            Connectors surface their data through Conduit&rsquo;s API as normalised domain models.
          </span>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-body-sm font-medium"
          style={{
            background: live ? "color-mix(in srgb, var(--color-success-solid) 16%, transparent)" : "var(--color-component)",
            color: live ? "var(--color-success-solid)" : "var(--color-tertiary-foreground)",
          }}
        >
          {live ? "Live · Supabase" : demoData ? "Sample data" : "Clean install"}
        </span>
      </div>

      <Divider />
      {/* The sample estate lives here rather than with the appearance settings:
          it is a question about what data this workspace holds, which is what
          this page is for. Off is the default — Conduit ships empty. */}
      <Row label="Sample data">
        <div className="flex items-center justify-between gap-4 pt-0.5">
          <span className="text-body-sm text-tertiary-foreground">
            Load a demo estate — workflows, runners, runs and users — so the platform can be shown without building
            one first. Switching it replaces everything, including anything you have created here.
          </span>
          <Switch checked={demoData} onChange={setDemoData} label="Sample data" />
        </div>
      </Row>

      {integrationError && (
        <div
          className="mb-4 rounded-lg px-3 py-2.5 text-body-sm"
          style={{
            background: "color-mix(in srgb, var(--color-warning-solid) 12%, transparent)",
            color: "var(--color-secondary-foreground)",
          }}
        >
          Couldn&rsquo;t reach the backend — showing local data{demoData ? " (the sample estate)" : ""}.{" "}
          <span className="text-tertiary-foreground">({integrationError})</span>
        </div>
      )}

      <Divider />
      <Row label="Capabilities">
        <div className="flex flex-wrap gap-1.5">
          {capabilities.length === 0 ? (
            <span className="text-body-sm text-tertiary-foreground">None enabled.</span>
          ) : (
            capabilities.map((c) => (
              <span key={c} className="rounded-md bg-component px-2 py-1 text-body-sm text-secondary-foreground">
                {c}
              </span>
            ))
          )}
        </div>
      </Row>

      <Divider />
      <div className="flex flex-col gap-2 py-4">
        {/* "Workflows", not "Bots" — these are our normalised domain models coming
            back through our own API, and one word for the central object is the
            naming decision stage 6 settled. */}
        <span className="text-body-sm font-medium text-primary-foreground">Workflows ({connectedWorkflows.length})</span>
        <DataTable
          columns={WORKFLOW_COLUMNS}
          rows={connectedWorkflows}
          empty="No connector is configured, so nothing is being mirrored in."
        />
        <span className="text-body-sm text-tertiary-foreground">
          Namespaced by connector instance ({dataSource === "live" ? "live connectors" : "the local library, shown as our API would return it"}).
        </span>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Placeholder pages
   --------------------------------------------------------------------------- */

function PlaceholderPage({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-component text-tertiary-foreground">
        {icon}
      </span>
      <span className="text-body-base font-medium text-secondary-foreground">{title}</span>
      <span className="max-w-xs text-body-sm text-tertiary-foreground">{hint}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Panel: header + active page
   --------------------------------------------------------------------------- */

const PLACEHOLDER_HINTS: Record<string, string> = {
  alerts: "Configure how and when Conduit notifies you about new incidents.",
  integrations: "Connect Conduit to Slack, PagerDuty, GitHub and more.",
  developer: "API keys, webhooks and developer tooling live here.",
};

/** The settings pages, rendered in the main content panel (below the existing
 *  breadcrumb titlebar). The rail shows the settings nav; this shows the page. */
export function SettingsContent() {
  const { subview, openSubview, isMobile } = useStore();
  const pageId = subview ?? DEFAULT_SETTINGS_PAGE;
  const page = SETTINGS_PAGES.find((p) => p.id === pageId) ?? SETTINGS_PAGES[0];

  // Settings navigates from the sidebar rail, which the phone shell doesn't
  // mount — so without this every settings page but the first is unreachable
  // there. A scrolling tab strip is the same control the tabbed pages already
  // use, and it puts the seven pages in the one row a phone has for them.
  const nav = isMobile ? (
    <TabStrip
      ariaLabel="Settings"
      segments={SETTINGS_PAGES.map((p) => ({ id: p.id, label: p.label }))}
      value={pageId}
      onChange={(id) => openSubview("settings", id)}
    />
  ) : null;

  return (
    <div key={pageId} className="animate-in fade-in-0 duration-200 ease-out flex min-h-0 min-w-0 flex-1 flex-col">
      {nav}
      {pageId === "profile" ? (
        <ProfilePage />
      ) : pageId === "workspace" ? (
        <WorkspaceDetailsPage />
      ) : pageId === "resources" ? (
        <ResourcesPage />
      ) : pageId === "integrations" ? (
        <IntegrationsPage />
      ) : (
        <PlaceholderPage icon={page.icon} title={page.label} hint={PLACEHOLDER_HINTS[pageId] ?? "Coming soon."} />
      )}
    </div>
  );
}
