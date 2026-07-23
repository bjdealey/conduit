/** Workspaces the user can switch between via the sidebar logo. The first is the
 *  default. The product logo/name stay fixed; the workspace shows as a subtitle. */
export type Workspace = { id: string; name: string };

export const workspaces: Workspace[] = [
  { id: "production", name: "Production" },
  { id: "client-sandbox", name: "Client Sandbox" },
  { id: "staging", name: "Staging" },
  { id: "personal", name: "Personal" },
];
