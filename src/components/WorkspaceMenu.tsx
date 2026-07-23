import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useStore } from "../store";
import { RailTooltip } from "./RailTooltip";

/** The fixed Conduit product mark (28px — matches the rail tile size). */
function ConduitMark() {
  return (
    <span className="rail-tile flex size-7 shrink-0 items-center justify-center rounded-md bg-standout">
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
        <g fill="var(--color-page)">
          <rect x="2" y="2" width="3" height="3" rx="0.5" />
          <rect x="6.5" y="2" width="3" height="3" rx="0.5" opacity="0.5" />
          <rect x="6.5" y="6.5" width="3" height="3" rx="0.5" />
          <rect x="11" y="6.5" width="3" height="3" rx="0.5" opacity="0.5" />
          <rect x="2" y="11" width="3" height="3" rx="0.5" opacity="0.5" />
          <rect x="11" y="11" width="3" height="3" rx="0.5" />
        </g>
      </svg>
    </span>
  );
}

/** Sidebar logo. Product logo + name stay fixed; the current workspace shows as
 *  a subtitle. Clicking opens a workspace switcher dropdown. */
export function WorkspaceMenu({ expanded }: { expanded: boolean }) {
  const { workspaces, workspace, setWorkspaceId } = useStore();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conduit · ${workspace.name} workspace`}
        className="group pressable focusable relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 transition-colors"
      >
        {/* The mark stays pinned (centred on the rail axis in both states); the
            name + chevron cross-fade so the header morphs rather than swapping. */}
        <span className="rail-hl" aria-hidden />
        <ConduitMark />
        <span className="rail-fade flex min-w-0 flex-1 flex-col text-left leading-tight">
          <span className="truncate font-sans font-medium text-body-base text-primary-foreground">Conduit</span>
          <span className="truncate text-tertiary-foreground" style={{ fontSize: "0.7rem" }}>{workspace.name}</span>
        </span>
        <ChevronsUpDown size={16} strokeWidth={1.7} className="rail-fade shrink-0 text-tertiary-foreground" />
        {!expanded && <RailTooltip label={`Conduit · ${workspace.name}`} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={close} />
          <div
            role="menu"
            className="pop-in absolute rounded-xl border-border-default border-[0.5px] bg-page p-1.5"
            style={{
              zIndex: 50,
              top: "calc(100% + 8px)",
              left: 0,
              width: 240,
              transformOrigin: "top left",
              boxShadow: "0 12px 32px -8px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.04)",
            }}
          >
            <div className="px-2 pt-1 pb-1.5 font-medium uppercase tracking-wide text-tertiary-foreground" style={{ fontSize: "0.65rem" }}>
              Workspaces
            </div>
            <div className="flex flex-col">
              {workspaces.map((w) => {
                const active = w.id === workspace.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setWorkspaceId(w.id);
                      close();
                    }}
                    className="focusable flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-transparent-hover"
                  >
                    <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{w.name}</span>
                    {active && (
                      <Check size={16} strokeWidth={2} className="shrink-0 text-primary-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
