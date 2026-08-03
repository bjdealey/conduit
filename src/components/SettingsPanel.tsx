import { type ReactNode } from "react";
import { Building2, ChevronDown, Globe, Plus } from "lucide-react";
import { useStore } from "../store";
import { currentUser } from "../data/user";
import { Switch } from "./Switch";
import { DataTable, type Column } from "./DataTable";
import { Button } from "./Button";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { ROLES, ROLE_BLURB, ROLE_LABEL, type Workflow } from "@conduit/domain";

/* ---------------------------------------------------------------------------
   Shared form primitives
   --------------------------------------------------------------------------- */

function Divider() {
  return <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />;
}

/** Label-left / control-right settings row. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-8 py-5">
      <div className="w-40 shrink-0 pt-1.5">
        <span className="text-body-sm font-medium text-primary-foreground">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TextInput({ defaultValue, prefix, mono }: { defaultValue?: string; prefix?: string; mono?: boolean }) {
  return (
    <label className="flex items-center rounded-lg border-border-strong border-[0.5px] bg-page">
      {prefix && <span className="pl-3 text-body-sm text-tertiary-foreground">{prefix}</span>}
      <input
        defaultValue={defaultValue}
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
const ROLE_OPTIONS = ROLES.map((id) => ({ id, label: ROLE_LABEL[id] }));

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
    role,
    setRole,
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
      <Row label="Name">
        <TextInput defaultValue={currentUser.name} />
      </Row>
      <Row label="Email">
        <TextInput defaultValue={currentUser.email} />
      </Row>
      <Row label="Role">
        <div className="flex flex-col gap-2 pt-0.5">
          <div className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-component p-0.5">
            {ROLE_OPTIONS.map((o) => {
              const active = role === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setRole(o.id)}
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
          <span className="text-body-sm text-tertiary-foreground">{ROLE_BLURB[role]}</span>
        </div>
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
  const { connectedWorkflows, capabilities, dataSource, integrationError } = useStore();
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
          {live ? "Live · Supabase" : "Seed data"}
        </span>
      </div>

      {integrationError && (
        <div
          className="mb-4 rounded-lg px-3 py-2.5 text-body-sm"
          style={{
            background: "color-mix(in srgb, var(--color-warning-solid) 12%, transparent)",
            color: "var(--color-secondary-foreground)",
          }}
        >
          Couldn&rsquo;t reach the backend — showing seed data. <span className="text-tertiary-foreground">({integrationError})</span>
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
        <span className="text-body-sm font-medium text-primary-foreground">Bots ({connectedWorkflows.length})</span>
        <DataTable columns={WORKFLOW_COLUMNS} rows={connectedWorkflows} empty="No connectedWorkflows reported by any connector." />
        <span className="text-body-sm text-tertiary-foreground">
          Namespaced by connector instance ({dataSource === "live" ? "live connectors" : "the local seed connector"}).
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
  team: "Invite teammates and manage roles and permissions.",
  billing: "Manage your plan, payment method and invoices.",
};

/** The settings pages, rendered in the main content panel (below the existing
 *  breadcrumb titlebar). The rail shows the settings nav; this shows the page. */
export function SettingsContent() {
  const { subview } = useStore();
  const pageId = subview ?? DEFAULT_SETTINGS_PAGE;
  const page = SETTINGS_PAGES.find((p) => p.id === pageId) ?? SETTINGS_PAGES[0];

  return (
    <div key={pageId} className="animate-in fade-in-0 duration-200 ease-out flex min-h-0 min-w-0 flex-1 flex-col">
      {pageId === "profile" ? (
        <ProfilePage />
      ) : pageId === "workspace" ? (
        <WorkspaceDetailsPage />
      ) : pageId === "integrations" ? (
        <IntegrationsPage />
      ) : (
        <PlaceholderPage icon={page.icon} title={page.label} hint={PLACEHOLDER_HINTS[pageId] ?? "Coming soon."} />
      )}
    </div>
  );
}
