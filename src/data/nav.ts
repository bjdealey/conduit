import type { View } from "../store";

/** A subpage under a top-level sidebar page. */
export type SubPage = { id: string; label: string };

export type NavItemDef = { id: View; label: string; subpages?: SubPage[] };

/** Sidebar navigation structure. Items with `subpages` expand in the sidebar and
 *  show a hover flyout when collapsed. */
export const navItems: NavItemDef[] = [
  { id: "activity", label: "Activity" },
  { id: "inbox", label: "Inbox" },
  { id: "users", label: "Users" },
  { id: "surfaces", label: "Surfaces" },
  { id: "environments", label: "Environments" },
  { id: "settings", label: "Settings" },
];
