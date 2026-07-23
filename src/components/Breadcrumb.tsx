import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

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
 *  same on every page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
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
