import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  /** Optional leading icon (shown for non-terminal crumbs). */
  icon?: ReactNode;
  /** Navigation handler; omit on the current (last) crumb. */
  onClick?: () => void;
};

function Chevron() {
  return <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />;
}

/** Consistent breadcrumb trail: Home › Section › Page. Intermediate crumbs show
 *  their icon and are clickable; the final crumb is bold and inert. */
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
                className="focusable -mx-1 flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-secondary-foreground transition-colors hover:text-primary-foreground"
              >
                {crumb.icon && <span className="flex items-center justify-center">{crumb.icon}</span>}
                <span className="whitespace-nowrap">{crumb.label}</span>
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
