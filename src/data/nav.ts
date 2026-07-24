import type { View } from "../store";
import type { Role } from "./types";
import type { Capability } from "@conduit/domain";

/** A subpage under a top-level sidebar page. */
export type SubPage = { id: string; label: string };

/** `roles`, when present, restricts the item to those roles (permission gating).
 *  `capability`, when present, shows the item only while that capability is enabled by
 *  some connector — the UI is driven by declared capabilities, not vendor identity. */
export type NavItemDef = {
  id: View;
  label: string;
  subpages?: SubPage[];
  roles?: Role[];
  capability?: Capability;
};

/** Sidebar navigation structure. Items with `subpages` expand in the sidebar and
 *  show a hover flyout when collapsed. */
export const navItems: NavItemDef[] = [
  { id: "activity", label: "Activity" },
  { id: "inbox", label: "Inbox" },
  { id: "automations", label: "Automations", capability: "bots" as Capability },
  { id: "manage", label: "Manage" },
  { id: "users", label: "Users" },
  { id: "administration", label: "Administration", roles: ["admin", "developer"] },
  { id: "surfaces", label: "Surfaces" },
  { id: "environments", label: "Environments" },
  { id: "settings", label: "Settings" },
];
