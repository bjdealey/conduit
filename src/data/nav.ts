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

/** Navigation structure. Items with `subpages` expand in the sidebar and show a
 *  hover flyout when collapsed. */
export const navItems: NavItemDef[] = [
  { id: "home", label: "Home" },
  { id: "activity", label: "Activity" },
  { id: "inbox", label: "Inbox" },
  { id: "workflows", label: "Workflows", capability: "workflows" as Capability },
  { id: "review", label: "Review", roles: ["admin", "professional"] },
  { id: "manage", label: "Manage" },
  { id: "audit", label: "Audit", roles: ["admin", "professional"], capability: "audit" as Capability },
  { id: "users", label: "Users" },
  { id: "administration", label: "Administration", roles: ["admin", "professional"] },
  { id: "surfaces", label: "Surfaces" },
  { id: "runners", label: "Runners", capability: "devices" as Capability },
  { id: "settings", label: "Settings" },
];

/** How many destinations the phone's bottom bar shows before "More". Five slots
 *  across the narrowest phone leaves ~72px each — a comfortable tap target with
 *  its label still legible — so four destinations plus the overflow. */
export const MOBILE_BAR_SLOTS = 4;

/** The destinations that earn a permanent slot on the bottom bar, in bar order.
 *
 *  Everything else stays reachable behind "More" — the bar is a shortcut to the
 *  work, not a second copy of the sidebar. These four are the ones a phone is
 *  actually used for: checking what ran, what needs attention, and what exists.
 *  Governance and administration surfaces are desk work and sit in the sheet.
 *
 *  Order is independent of `navItems` because the bar is read left-to-right
 *  under the thumb, not scanned top-down. Gating still applies first: an item the
 *  current tier or capability set hides never takes a slot (`splitDestinations`). */
export const MOBILE_BAR: View[] = ["home", "workflows", "activity", "inbox"];
