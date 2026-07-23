import { ArrowLeft } from "lucide-react";
import { useStore } from "../store";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { RailTooltip } from "./RailTooltip";

/** Back control shown in the workspace-logo slot while in Settings mode. Styled
 *  as a rail item so it morphs and collapses like the rest of the rail. */
export function SettingsBack({ expanded }: { expanded: boolean }) {
  const { exitSettings } = useStore();
  return (
    <div className="group relative mb-2 flex w-full flex-col">
      <button
        type="button"
        onClick={exitSettings}
        aria-label="Back"
        className="rail-item focusable relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg pl-2.5 pr-2.5 text-secondary-foreground transition-colors hover:text-primary-foreground"
      >
        <span className="rail-hl" aria-hidden />
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          <ArrowLeft size={20} strokeWidth={1.8} />
        </span>
        <span className="rail-fade relative min-w-0 flex-1 truncate text-left text-body-sm font-medium">Back</span>
      </button>
      {!expanded && <RailTooltip label="Back" />}
    </div>
  );
}

/** The settings sub-page list that replaces the primary nav while in Settings. */
export function SettingsNav({ expanded }: { expanded: boolean }) {
  const { subview, openSubview } = useStore();
  const active = subview ?? DEFAULT_SETTINGS_PAGE;

  return (
    <div className="flex w-full flex-col items-center gap-1">
      {SETTINGS_PAGES.map((page) => {
        const isActive = active === page.id;
        return (
          <div key={page.id} className="group relative flex w-full flex-col">
            <button
              type="button"
              onClick={() => openSubview("settings", page.id)}
              aria-current={isActive ? "page" : undefined}
              className={
                "rail-item focusable relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg pl-2.5 pr-2.5 transition-colors " +
                (isActive
                  ? "text-primary-foreground"
                  : "text-tertiary-foreground hover:text-primary-foreground")
              }
            >
              <span className="rail-hl" data-active={isActive ? "true" : undefined} aria-hidden />
              <span className="relative flex size-5 shrink-0 items-center justify-center">{page.icon}</span>
              <span className="rail-fade relative min-w-0 flex-1 truncate text-left text-body-sm font-medium">
                {page.label}
              </span>
            </button>
            {!expanded && <RailTooltip label={page.label} />}
          </div>
        );
      })}
    </div>
  );
}
