import { Hash } from "lucide-react";
import type { SubPage } from "../data/nav";

const HashIcon = <Hash size={15} strokeWidth={1.7} />;

/** Collapsed-sidebar hover flyout listing a page's subpages. The page name (a
 *  clickable header) navigates to the parent; each row opens a subpage. */
export function RailFlyout({
  title,
  subpages,
  onParent,
  onSub,
}: {
  title: string;
  subpages: SubPage[];
  onParent: () => void;
  onSub: (id: string) => void;
}) {
  return (
    <div className="rail-flyout absolute" style={{ left: "100%", top: 0, paddingLeft: 8, zIndex: 20 }}>
      <div
        role="menu"
        className="rounded-xl border-border-default border-[0.5px] bg-page p-1.5"
        style={{ width: 200, boxShadow: "var(--s-popover)" }}
      >
        <button
          type="button"
          onClick={onParent}
          className="focusable flex w-full items-center rounded-md px-2 py-1.5 text-left text-body-sm font-medium text-primary-foreground transition-colors hover:bg-transparent-hover"
        >
          {title}
        </button>
        <div className="my-1 h-px" style={{ background: "var(--color-border-default)" }} />
        <div className="flex flex-col">
          {subpages.map((sp) => (
            <button
              key={sp.id}
              type="button"
              role="menuitem"
              onClick={() => onSub(sp.id)}
              className="focusable flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
            >
              <span className="flex shrink-0 items-center justify-center text-tertiary-foreground">{HashIcon}</span>
              <span className="min-w-0 flex-1 truncate">{sp.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
