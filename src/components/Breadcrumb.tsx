import { Fragment } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../store";

export type Crumb = {
  label: string;
  /** Navigation handler; omit on the current (last) crumb. */
  onClick?: () => void;
};

function Chevron() {
  return <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />;
}

/** Consistent breadcrumb trail: Section › Page. Intermediate crumbs are clickable;
 *  the final crumb is bold and inert. Text only — no icons — so the trail reads the
 *  same on every page.
 *
 *  On a phone the trail collapses to where you are plus one tap back to the list
 *  you came from. "Workflows › Shared › Monitoring › Synthetics › Uptime probe"
 *  is five crumbs and one 390px titlebar, and truncating it to "Workflows › Sh…"
 *  loses the half that says where you are.
 *
 *  The arrow fires the *first* clickable crumb — the section — rather than the
 *  nearest ancestor, because on a phone the section is a screen and the ancestors
 *  are not: the tree that shows them is the screen you're going back to, and
 *  climbing a folder at a time would land you on a series of folder details you
 *  never asked for. Where a trail is two crumbs long (a user, a runner, a run)
 *  the two readings are the same crumb anyway. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { isMobile } = useStore();

  if (isMobile) {
    const here = items[items.length - 1];
    const back = items.slice(0, -1).find((c) => c.onClick);
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1">
        {back && (
          <button
            type="button"
            onClick={back.onClick}
            aria-label={`Back to ${back.label}`}
            className="pressable focusable tap-target -ml-2 flex shrink-0 items-center justify-center rounded-lg text-secondary-foreground transition-colors hover:bg-transparent-hover"
          >
            <ChevronLeft size={22} strokeWidth={1.8} />
          </button>
        )}
        <span aria-current="page" className="truncate font-medium text-body-lg text-primary-foreground">
          {here?.label}
        </span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-body-base">
      {items.map((crumb, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <Chevron />}
            {last || !crumb.onClick ? (
              <span
                aria-current={last ? "page" : undefined}
                className="truncate font-medium text-primary-foreground"
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={crumb.onClick}
                className="focusable -mx-1 flex shrink-0 items-center rounded-md px-1 py-0.5 text-secondary-foreground transition-colors hover:text-primary-foreground"
              >
                <span className="whitespace-nowrap">{crumb.label}</span>
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
