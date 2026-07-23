import { PanelLeft } from "lucide-react";
import { useStore } from "../store";

/** Icon-only sidebar collapse/expand toggle. Lives in the main content header
 *  (just left of the header title), not inside the rail. Uses a panel glyph that
 *  mirrors the right-hand info-pane toggle, so the two edge controls read as a
 *  matched pair (filled when their panel is expanded/shown). */
export function SidebarToggle() {
  const { sidebarExpanded, toggleSidebar } = useStore();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={sidebarExpanded}
      aria-pressed={sidebarExpanded}
      title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
      className="pressable focusable -ml-1 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-transparent-hover"
      style={{
        background: sidebarExpanded ? "var(--color-transparent-hover)" : "transparent",
        color: sidebarExpanded ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
      }}
    >
      <PanelLeft size={16} strokeWidth={1.8} />
    </button>
  );
}
