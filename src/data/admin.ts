import type { Role } from "./types";

/**
 * Administration data — the platform-user / governance surface, distinct from the
 * end-user monitoring in `users.ts`. Platform users tie to `members` (the team who
 * own workflows and are incident assignees) and carry a role that gates the UI.
 * In-memory prototype data — edit freely.
 */

export type PlatformUserStatus = "Active" | "Invited" | "Suspended";

export type PlatformUser = {
  id: string;
  /** Ties to `members` for avatar + name. Absent for an account that has been
   *  invited but never signed in: there is no profile to tie to yet, and the row
   *  shows the address the invitation went to. Borrowing another member's id to
   *  fill the column put someone else's name and face against a shared mailbox on
   *  the one screen that governs access. */
  memberId?: string;
  email: string;
  role: Role;
  status: PlatformUserStatus;
  lastActive: string;
};

export const platformUsers: PlatformUser[] = [
  { id: "pu_ls", memberId: "ls", email: "luke@conduit.com", role: "admin", status: "Active", lastActive: "2 minutes ago" },
  { id: "pu_pf", memberId: "pf", email: "priya@conduit.com", role: "professional", status: "Active", lastActive: "12 minutes ago" },
  { id: "pu_jk", memberId: "jk", email: "jonas@conduit.com", role: "professional", status: "Active", lastActive: "an hour ago" },
  { id: "pu_ps", memberId: "ps", email: "paulo@conduit.com", role: "builder", status: "Active", lastActive: "20 minutes ago" },
  { id: "pu_am", email: "finance-ops@conduit.com", role: "consumer", status: "Invited", lastActive: "—" },
];

export type RoleDef = { id: Role; name: string; description: string; permissions: string };

export const roleDefs: RoleDef[] = [
  { id: "consumer", name: "Consumer", description: "Runs the workflows they're permitted to run, and reads the results. Doesn't build.", permissions: "Trigger · View output" },
  { id: "builder", name: "Citizen builder", description: "Builds their own workflows and submits them for review. Cannot publish their own work.", permissions: "Trigger · Author · Submit" },
  { id: "professional", name: "Professional", description: "Builds the hard workflows, reviews submissions, and owns what runs in production.", permissions: "Trigger · Author · Submit · Review · Publish" },
  { id: "admin", name: "Admin", description: "Everything a professional can do, plus users, roles, policies and billing.", permissions: "All permissions" },
];

export type License = { id: string; name: string; plan: string; seatsUsed: number; seatsTotal: number; renews: string };

export const licenses: License[] = [
  { id: "lic_seats", name: "Platform seats", plan: "Enterprise", seatsUsed: 4, seatsTotal: 10, renews: "in 3 months" },
  { id: "lic_runners", name: "Workflow runners", plan: "Enterprise", seatsUsed: 3, seatsTotal: 5, renews: "in 3 months" },
  { id: "lic_api", name: "API access", plan: "Add-on", seatsUsed: 2, seatsTotal: 5, renews: "in 3 months" },
];

export type Policy = { id: string; name: string; description: string; scope: string; enabled: boolean };

export const policies: Policy[] = [
  { id: "pol_mfa", name: "Require MFA", description: "All members must sign in with two-factor authentication.", scope: "Workspace", enabled: true },
  { id: "pol_public", name: "Restrict public workflows", description: "Only admins can publish workflows to Public.", scope: "Workflows", enabled: true },
  { id: "pol_secret", name: "Secret rotation", description: "Rotate credentials every 90 days.", scope: "Credentials", enabled: false },
  { id: "pol_approval", name: "Production run approval", description: "Runs against production require a second approver.", scope: "Execution", enabled: false },
];
