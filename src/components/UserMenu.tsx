import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Layers, LogOut, Pin, Settings, UserPlus } from "lucide-react";
import { currentUser } from "../data/user";
import { useStore } from "../store";
import { RailTooltip } from "./RailTooltip";

const iconProps = { size: 18, strokeWidth: 1.7 };

const Icons = {
  settings: <Settings {...iconProps} />,
  workspace: <Layers {...iconProps} />,
  docs: <BookOpen {...iconProps} />,
  pin: <Pin {...iconProps} />,
  invite: <UserPlus {...iconProps} />,
  logout: <LogOut {...iconProps} />,
};

type Item = { label: string; icon: ReactNode; onClick?: () => void };

function MenuRow({ item, onClose }: { item: Item; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        item.onClick?.();
        onClose();
      }}
      className="focusable flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
    >
      <span className="flex shrink-0 items-center justify-center text-tertiary-foreground">
        {item.icon}
      </span>
      {item.label}
    </button>
  );
}

function Divider() {
  return <div className="my-1.5 h-px" style={{ background: "var(--color-border-default)" }} />;
}

/** Avatar button pinned at the bottom of the sidebar; opens an account popover. */
export function UserMenu({ expanded }: { expanded: boolean }) {
  const { signOut } = useStore();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups: Item[][] = [
    [
      { label: "Account settings", icon: Icons.settings },
      { label: "Workspace", icon: Icons.workspace },
      { label: "Documentation", icon: Icons.docs },
    ],
    [
      { label: "Pinned issues", icon: Icons.pin },
      { label: "Invite teammates", icon: Icons.invite },
    ],
  ];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${currentUser.name}`}
        className="group pressable focusable relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 transition-colors"
      >
        {/* Avatar + status dot — pinned (centred on the rail axis in both states);
            the name + email cross-fade so the row morphs rather than swapping. */}
        <span className="rail-hl" aria-hidden />
        <span className="rail-tile relative shrink-0">
          <span
            className="flex size-7 items-center justify-center rounded-md font-medium"
            style={{ background: "var(--gray-4)", color: "var(--gray-11)", fontSize: "0.62rem" }}
          >
            {currentUser.initials}
          </span>
          <span
            className="absolute rounded-full"
            style={{
              right: -1,
              bottom: -1,
              width: 9,
              height: 9,
              background: "var(--grass-9)",
              boxShadow: "0 0 0 2px var(--color-shell)",
            }}
          />
        </span>
        <span className="rail-fade flex min-w-0 flex-1 flex-col text-left leading-tight">
          <span className="truncate text-body-sm font-medium text-primary-foreground">{currentUser.name}</span>
          <span className="truncate text-tertiary-foreground" style={{ fontSize: "0.68rem" }}>{currentUser.email}</span>
        </span>
        {!expanded && <RailTooltip label={currentUser.name} />}
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={close} />
          {/* Popover */}
          <div
            role="menu"
            className="pop-in absolute rounded-xl border-border-default border-[0.5px] bg-page py-1.5"
            style={{
              zIndex: 50,
              bottom: "calc(100% + 8px)",
              left: 0,
              width: 264,
              transformOrigin: "bottom left",
              boxShadow: "var(--s-popover)",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-md font-medium"
                style={{ background: "var(--gray-4)", color: "var(--gray-11)", fontSize: "0.78rem" }}
              >
                {currentUser.initials}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-body-sm font-medium text-primary-foreground">{currentUser.name}</span>
                <span className="truncate text-tertiary-foreground" style={{ fontSize: "0.72rem" }}>{currentUser.email}</span>
              </span>
            </div>

            {groups.map((group, i) => (
              <div key={i}>
                <Divider />
                <div className="flex flex-col px-1.5">
                  {group.map((item) => (
                    <MenuRow key={item.label} item={item} onClose={close} />
                  ))}
                </div>
              </div>
            ))}

            <Divider />
            <div className="flex flex-col px-1.5">
              <MenuRow item={{ label: "Log out", icon: Icons.logout, onClick: signOut }} onClose={close} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
