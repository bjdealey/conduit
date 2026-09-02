import { type ReactNode } from "react";
import { Bell, Boxes, Building2, Code2, KeyRound, User } from "lucide-react";

const iconProps = { size: 20, strokeWidth: 1.7 };

export type SettingsPageDef = { id: string; label: string; icon: ReactNode };

/** Settings sub-pages. In Settings mode these replace the primary nav in the
 *  existing rail; the selected page renders in the main content panel.
 *
 *  There is no Team page and no Billing page: both were placeholders describing
 *  what Governance → Administration already does (accounts and roles; licences
 *  and seats). Two doors onto one thing means the reader has to find out which
 *  one is real. */
export const SETTINGS_PAGES: SettingsPageDef[] = [
  { id: "profile", label: "Profile", icon: <User {...iconProps} /> },
  { id: "workspace", label: "Workspace details", icon: <Building2 {...iconProps} /> },
  { id: "resources", label: "Resources", icon: <KeyRound {...iconProps} /> },
  { id: "alerts", label: "Alerts", icon: <Bell {...iconProps} /> },
  { id: "integrations", label: "Integrations", icon: <Boxes {...iconProps} /> },
  { id: "developer", label: "Developer", icon: <Code2 {...iconProps} /> },
];

export const DEFAULT_SETTINGS_PAGE = SETTINGS_PAGES[0].id;
