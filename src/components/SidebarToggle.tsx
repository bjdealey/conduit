import { ChevronsRight } from "lucide-react";
import { useStore } from "../store";

/** Icon-only sidebar collapse/expand toggle. Lives in the main content header
 *  (just left of the header title), not inside the rail. The chevrons rotate to
 *  animate between the collapsed (>>) and expanded (<<) states. */
export function SidebarToggle() {
  const { sidebarExpanded, toggleSidebar } = useStore();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={sidebarExpanded}
      title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
      className="pressable focusable -ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
    >
      <ChevronsRight
        size={18}
        strokeWidth={1.7}
        style={{
          transform: sidebarExpanded ? "rotate(180deg)" : "none",
          transition: "transform 0.2s ease",
        }}
      />
    </button>
  );
}
