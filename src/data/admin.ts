import type { Role } from "./types";

/**
 * Administration data — the platform-user / governance surface, distinct from the
 * end-user monitoring in `users.ts`. Platform users tie to `members` (the team who
 * own automations and are incident assignees) and carry a role that gates the UI.
 * In-memory prototype data — edit freely.
 */

export type PlatformUserStatus = "Active" | "Invited" | "Suspended";

export type PlatformUser = {
  id: string;
  /** Ties to `members` for avatar + name. */
  memberId: string;
  email: string;
  role: Role;
  status: PlatformUserStatus;
  lastActive: string;
};

export const platformUsers: PlatformUser[] = [
  { id: "pu_ls", memberId: "ls", email: "luke@conduit.com", role: "admin", status: "Active", lastActive: "2 minutes ago" },
  { id: "pu_pf", memberId: "pf", email: "priya@conduit.com", role: "developer", status: "Active", lastActive: "12 minutes ago" },
  { id: "pu_jk", memberId: "jk", email: "jonas@conduit.com", role: "developer", status: "Active", lastActive: "an hour ago" },
  { id: "pu_ps", memberId: "ps", email: "paulo@conduit.com", role: "user", status: "Invited", lastActive: "—" },
];

export type RoleDef = { id: Role; name: string; description: string; permissions: string };

export const roleDefs: RoleDef[] = [
  { id: "admin", name: "Admin", description: "Full access: manage users, roles, policies and billing.", permissions: "All permissions" },
  { id: "developer", name: "Developer", description: "Build and run automations; read-only administration.", permissions: "Automations · Runs · Manage" },
  { id: "user", name: "User", description: "View incidents and automation activity.", permissions: "Read incidents & activity" },
];

export type License = { id: string; name: string; plan: string; seatsUsed: number; seatsTotal: number; renews: string };

export const licenses: License[] = [
  { id: "lic_seats", name: "Platform seats", plan: "Enterprise", seatsUsed: 4, seatsTotal: 10, renews: "in 3 months" },
  { id: "lic_runners", name: "Automation runners", plan: "Enterprise", seatsUsed: 3, seatsTotal: 5, renews: "in 3 months" },
  { id: "lic_api", name: "API access", plan: "Add-on", seatsUsed: 2, seatsTotal: 5, renews: "in 3 months" },
];

export type Policy = { id: string; name: string; description: string; scope: string; enabled: boolean };

export const policies: Policy[] = [
  { id: "pol_mfa", name: "Require MFA", description: "All members must sign in with two-factor authentication.", scope: "Workspace", enabled: true },
  { id: "pol_public", name: "Restrict public automations", description: "Only admins can publish automations to Public.", scope: "Automations", enabled: true },
  { id: "pol_secret", name: "Secret rotation", description: "Rotate credentials every 90 days.", scope: "Credentials", enabled: false },
  { id: "pol_approval", name: "Production run approval", description: "Runs against production require a second approver.", scope: "Execution", enabled: false },
];
