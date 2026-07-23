import { useMemo, useState } from "react";
import { Lock, Plus, ShieldCheck } from "lucide-react";
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
import { SegmentedControl } from "./SegmentedControl";
import { Avatar } from "./Avatar";
import { Switch } from "./Switch";
import { num } from "../lib/format";

const TABS = ["Users", "Roles", "Licenses", "Policies"] as const;
type Tab = (typeof TABS)[number];

const ROLE_ACCENT: Record<Role, string> = { admin: "violet", developer: "blue", user: "gray" };
const ROLES: Role[] = ["admin", "developer", "user"];

function RoleChip({ role }: { role: Role }) {
  const accent = ROLE_ACCENT[role];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.72rem] font-medium capitalize"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {role}
    </span>
  );
}

const STATUS_ACCENT: Record<PlatformUserStatus, string> = { Active: "grass", Invited: "amber", Suspended: "tomato" };

function StatusChip({ status }: { status: PlatformUserStatus }) {
  const accent = STATUS_ACCENT[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {status}
    </span>
  );
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
  const { memberById, role } = useStore();
  const [tab, setTab] = useState<Tab>("Users");
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

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Tabs + role-scoped action */}
      <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
        <SegmentedControl
          variant="ghost"
          ariaLabel="Administration"
          segments={TABS.map((t) => ({ id: t, label: t }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
        />
        {canEdit ? (
          tab === "Users" && (
            <button
              type="button"
              className="pressable focusable ml-auto inline-flex items-center gap-1 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover"
            >
              <Plus size={14} strokeWidth={2} />
              Invite
            </button>
          )
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-component px-2 py-1 text-[0.72rem] text-tertiary-foreground">
            <ShieldCheck size={13} strokeWidth={1.8} />
            Read-only
          </span>
        )}
      </div>

      {/* Table */}
      <div key={tab} className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-auto">
        <div className="min-w-[720px] px-3 py-2">
          {tab === "Users" && <DataTable columns={userCols} rows={users} empty="No platform users." />}
          {tab === "Roles" && <DataTable columns={roleCols} rows={roleDefs} empty="No roles." />}
          {tab === "Licenses" && <DataTable columns={licenseCols} rows={licenses} empty="No licenses." />}
          {tab === "Policies" && <DataTable columns={policyCols} rows={policies} empty="No policies." />}
        </div>
      </div>
    </div>
  );
}
