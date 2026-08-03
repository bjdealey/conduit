import { useMemo, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useStore } from "../store";
import type { Role } from "../data/types";
import {
  licenses,
  platformUsers as seedUsers,
  policies as seedPolicies,
  roleDefs,
  type License,
  type PlatformUser,
  type PlatformUserStatus,
  type Policy,
  type RoleDef,
} from "../data/admin";
import { DataTable, type Column } from "./DataTable";
import { Avatar } from "./Avatar";
import { Switch } from "./Switch";
import { num } from "../lib/format";
import { isNarrowed, matchesQuery, passesFilter } from "../lib/workspace";
import { TabStrip } from "./TabStrip";
import { Chip } from "./Chip";

const TABS = ["Users", "Roles", "Licenses", "Policies"] as const;
type Tab = (typeof TABS)[number];

const ROLE_ACCENT: Record<Role, string> = { admin: "violet", developer: "blue", user: "gray" };
const ROLES: Role[] = ["admin", "developer", "user"];

function RoleChip({ role }: { role: Role }) {
  return (
    <Chip tone={ROLE_ACCENT[role]} className="capitalize">
      {role}
    </Chip>
  );
}

const STATUS_ACCENT: Record<PlatformUserStatus, string> = { Active: "grass", Invited: "amber", Suspended: "tomato" };

function StatusChip({ status }: { status: PlatformUserStatus }) {
  return <Chip tone={STATUS_ACCENT[status]}>{status}</Chip>;
}

/** Inline role editor: an overlaid native <select> (admin only). */
function RoleEditor({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <span className="relative inline-flex items-center rounded-md px-1 -mx-1 transition-colors hover:bg-transparent-hover">
      <RoleChip role={value} />
      <select
        aria-label="Edit role"
        value={value}
        onChange={(e) => onChange(e.target.value as Role)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </span>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-component text-tertiary-foreground">
        <Lock size={20} strokeWidth={1.8} />
      </span>
      <span className="text-body-base font-medium text-secondary-foreground">Administration is restricted</span>
      <span className="max-w-xs text-body-sm text-tertiary-foreground">
        Your role doesn’t have access to this section. Ask an admin if you need it.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ view */

/** Administration — the role-gated platform-user & governance surface (distinct
 *  from end-user monitoring in Users). Admins can edit roles and toggle policies;
 *  developers get a read-only view; users don't reach it (nav-gated). */
export function AdministrationView() {
  const { memberById, role, controls, sectionTab, setSectionTab } = useStore();
  // Shared with the workspace header, so its search and filters follow the tab.
  const tab = (sectionTab("administration") || "Users") as Tab;
  const setTab = (next: Tab) => setSectionTab("administration", next);
  const state = controls("administration");
  // Local, editable copies so an admin's edits are reflected in the prototype.
  const [users, setUsers] = useState<PlatformUser[]>(seedUsers);
  const [policies, setPolicies] = useState<Policy[]>(seedPolicies);

  const canEdit = role === "admin";

  // Defensive: developers reach this read-only; users are nav-gated out, but guard
  // the direct-render case too.
  if (role === "user") return <AccessDenied />;

  const roleCounts = useMemo(() => {
    const c: Record<Role, number> = { admin: 0, developer: 0, user: 0 };
    for (const u of users) c[u.role] += 1;
    return c;
  }, [users]);

  const setUserRole = (id: string, r: Role) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: r } : u)));
  const togglePolicy = (id: string) =>
    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));

  const userCols: Column<PlatformUser>[] = [
    {
      key: "name",
      header: "Name",
      render: (u) => {
        const member = memberById(u.memberId);
        return (
          <span className="inline-flex items-center gap-2">
            {member && <Avatar member={member} size={22} />}
            <span className="font-medium">{member?.name ?? u.memberId}</span>
          </span>
        );
      },
    },
    { key: "email", header: "Email", render: (u) => <span className="text-secondary-foreground">{u.email}</span> },
    {
      key: "role",
      header: "Role",
      width: 150,
      render: (u) => (canEdit ? <RoleEditor value={u.role} onChange={(r) => setUserRole(u.id, r)} /> : <RoleChip role={u.role} />),
    },
    { key: "status", header: "Status", width: 120, render: (u) => <StatusChip status={u.status} /> },
    { key: "active", header: "Last active", render: (u) => <span className="text-tertiary-foreground">{u.lastActive}</span> },
  ];

  const roleCols: Column<RoleDef>[] = [
    { key: "role", header: "Role", width: 130, render: (r) => <RoleChip role={r.id} /> },
    { key: "desc", header: "Description", render: (r) => <span className="text-secondary-foreground">{r.description}</span> },
    { key: "perms", header: "Permissions", render: (r) => <span className="text-tertiary-foreground">{r.permissions}</span> },
    { key: "members", header: "Members", align: "right", width: 90, render: (r) => num(roleCounts[r.id]) },
  ];

  const licenseCols: Column<License>[] = [
    { key: "name", header: "License", render: (l) => <span className="font-medium">{l.name}</span> },
    { key: "plan", header: "Plan", width: 130, render: (l) => <span className="text-secondary-foreground">{l.plan}</span> },
    {
      key: "seats",
      header: "Seats",
      width: 200,
      render: (l) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-component">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(l.seatsUsed / l.seatsTotal) * 100}%`, background: "var(--color-brand-solid)" }}
            />
          </span>
          <span className="font-departure-mono text-[0.7rem] text-tertiary-foreground">
            {l.seatsUsed}/{l.seatsTotal}
          </span>
        </span>
      ),
    },
    { key: "renews", header: "Renews", render: (l) => <span className="text-tertiary-foreground">{l.renews}</span> },
  ];

  const policyCols: Column<Policy>[] = [
    {
      key: "policy",
      header: "Policy",
      render: (p) => (
        <span className="flex flex-col">
          <span className="font-medium text-primary-foreground">{p.name}</span>
          <span className="text-[0.72rem] text-tertiary-foreground">{p.description}</span>
        </span>
      ),
    },
    { key: "scope", header: "Scope", width: 140, render: (p) => <span className="text-secondary-foreground">{p.scope}</span> },
    {
      key: "status",
      header: "Status",
      width: 120,
      align: "right",
      render: (p) =>
        canEdit ? (
          <Switch checked={p.enabled} onChange={() => togglePolicy(p.id)} label={`Toggle ${p.name}`} />
        ) : (
          <span className="text-body-sm text-tertiary-foreground">{p.enabled ? "Enabled" : "Disabled"}</span>
        ),
    },
  ];

  const visibleUsers = users.filter(
    (u) =>
      matchesQuery(state.query, [memberById(u.memberId)?.name, u.email, u.role, u.status]) &&
      passesFilter(state, "role", u.role) &&
      passesFilter(state, "status", u.status),
  );
  const visibleRoles = roleDefs.filter((r) => matchesQuery(state.query, [r.id, r.description, r.permissions]));
  const visibleLicenses = licenses.filter((l) => matchesQuery(state.query, [l.name, l.plan, l.renews]));
  const visiblePolicies = policies.filter((p) => matchesQuery(state.query, [p.name, p.description, p.scope]));
  const empty = isNarrowed(state) ? "Nothing matches the current search or filters." : "Nothing to show yet.";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Tabs (search, filters, and the Invite action live in the workspace header) */}
      <TabStrip
        ariaLabel="Administration"
        segments={TABS.map((t) => ({ id: t, label: t }))}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
      >
        {!canEdit && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-component px-2 py-1 text-[0.72rem] text-tertiary-foreground">
            <ShieldCheck size={13} strokeWidth={1.8} />
            Read-only
          </span>
        )}
      </TabStrip>

      {/* Table */}
      <div key={tab} className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-auto">
        <div className="min-w-[720px] px-3 py-2">
          {tab === "Users" && <DataTable columns={userCols} rows={visibleUsers} empty={empty} />}
          {tab === "Roles" && <DataTable columns={roleCols} rows={visibleRoles} empty={empty} />}
          {tab === "Licenses" && <DataTable columns={licenseCols} rows={visibleLicenses} empty={empty} />}
          {tab === "Policies" && <DataTable columns={policyCols} rows={visiblePolicies} empty={empty} />}
        </div>
      </div>
    </div>
  );
}
