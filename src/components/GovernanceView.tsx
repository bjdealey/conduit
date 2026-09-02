import { useStore } from "../store";
import { defaultSubpage } from "../data/nav";
import { ReviewView } from "./ReviewView";
import { AuditView } from "./AuditView";
import { AdministrationView } from "./AdministrationView";

/**
 * Governance — the three screens that answer for what the platform did.
 *
 * Review is the queue you act on, Audit the trail you read, Administration the
 * rules you set. They were three rail destinations carrying the *identical* role
 * gate (`admin` · `professional`), which is the clearest possible sign they are
 * one place: the same job at three tempos.
 *
 * A router, not a rewrite — each subpage is the view that already existed,
 * untouched, including Administration's own Users/Roles/Licenses/Policies tabs.
 * The subpage falls back to the first one declared in `navItems`, the same way
 * `SettingsContent` falls back to `DEFAULT_SETTINGS_PAGE`, so arriving here from
 * the bottom bar or ⌘K (which clear `subview`) lands somewhere rather than
 * rendering nothing.
 */
export function GovernanceView() {
  const { subview } = useStore();
  const page = subview ?? defaultSubpage("governance");

  if (page === "audit") return <AuditView />;
  if (page === "administration") return <AdministrationView />;
  return <ReviewView />;
}
