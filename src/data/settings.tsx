import { type ReactNode } from "react";
import { Bell, Boxes, Building2, Code2, CreditCard, User, Users } from "lucide-react";

const iconProps = { size: 20, strokeWidth: 1.7 };

export type SettingsPageDef = { id: string; label: string; icon: ReactNode };

/** Settings sub-pages. In Settings mode these replace the primary nav in the
 *  existing rail; the selected page renders in the main content panel. */
export const SETTINGS_PAGES: SettingsPageDef[] = [
  { id: "profile", label: "Profile", icon: <User {...iconProps} /> },
  { id: "workspace", label: "Workspace details", icon: <Building2 {...iconProps} /> },
  { id: "alerts", label: "Alerts", icon: <Bell {...iconProps} /> },
  { id: "integrations", label: "Integrations", icon: <Boxes {...iconProps} /> },
  { id: "developer", label: "Developer", icon: <Code2 {...iconProps} /> },
  { id: "team", label: "Team", icon: <Users {...iconProps} /> },
  { id: "billing", label: "Billing", icon: <CreditCard {...iconProps} /> },
];

export const DEFAULT_SETTINGS_PAGE = SETTINGS_PAGES[0].id;
