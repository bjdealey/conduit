import type { ReactNode } from "react";
import { SegmentedControl, type Segment } from "./SegmentedControl";

/**
 * The section-tab bar that sits directly under the workspace header on a tabbed
 * page: a ghost segmented control on a hairline rule, optionally with a control
 * pushed to the trailing edge.
 *
 * Every tabbed surface in the app uses it — the two full-page tables (Manage,
 * Administration) and the six detail panes (Activity, Workflows, Environments,
 * Issue, Surfaces, Users). It exists because those eight had been carrying a
 * byte-identical copy of the container's class string; identical today, but
 * eight places to miss the next time the strip changes.
 *
 * Trailing content is passed as children and aligns right (`ml-auto` on the
 * child), as the Administration read-only chip and the Surfaces environment
 * picker do.
 */
export function TabStrip({
  ariaLabel,
  segments,
  value,
  onChange,
  children,
}: {
  ariaLabel: string;
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    // The strip scrolls sideways rather than wrapping or clipping: five tabs plus
    // a trailing control is wider than a phone, and a tab you cannot reach is a
    // section of the page you cannot reach. `scrollbar-none` because the bar is
    // 36px tall and a scrollbar in it would be most of that.
    <div className="scrollbar-none flex shrink-0 items-center gap-1 overflow-x-auto border-border-default border-b-[0.5px] px-3 py-2">
      <SegmentedControl variant="ghost" ariaLabel={ariaLabel} segments={segments} value={value} onChange={onChange} />
      {children}
    </div>
  );
}
