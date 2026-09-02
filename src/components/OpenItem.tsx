import { X } from "lucide-react";
import { useStore } from "../store";
import type { Issue } from "../data/types";
import { RailTooltip } from "./RailTooltip";

/** A pinned "open page" in the sidebar — one per opened issue. Colour-coded by
 *  the issue's assignee. Click to reopen; the × (on hover) closes/unpins it. */
export function OpenItem({ issue, expanded }: { issue: Issue; expanded: boolean }) {
  const { selectedId, section, select, openSubview, memberById, closeIssue } = useStore();
  const accent = memberById(issue.assigneeId)?.accent ?? "gray";
  const active = section === "activity/issues" && selectedId === issue.id;

  const open = () => {
    select(issue.id);
    openSubview("activity", "issues");
  };
  const close = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeIssue(issue.id);
  };

  return (
    // `rail-pin` fades and scales the row in as it is pinned (see app.css). It is
    // an *entrance only*, and the asymmetry is the decision rather than an omission:
    //
    //  • Arriving is unbidden. You open an issue in the main panel and a row
    //    materialises in your periphery, which is the one genuinely jarring change
    //    the rail makes. Nothing below it moves, because this group is the last
    //    thing in a `flex-1` scroll region — so a fade needs no height animation
    //    and no clipping to be complete.
    //  • Leaving is not. You hover this row, its × appears, you click it: a
    //    dismissal you already decided, with the cursor on the target, where an
    //    instant removal reads as crisp rather than abrupt.
    //
    // A leaving animation would also have to fold the row's height to bridge the
    // rows below sliding up, and folding a height means `overflow: hidden` on this
    // box — which would clip the collapsed rail's tooltip, since it escapes to
    // `left: 100%`. Fading without folding is worse than doing nothing: the row
    // would fade for its whole duration and *then* everything below would jump.
    <div className="rail-pin group relative flex w-full items-center">
      <button
        type="button"
        onClick={open}
        aria-label={`Open issue #${issue.id}: ${issue.title}`}
        aria-current={active ? "page" : undefined}
        className="rail-item focusable relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg pl-1.5 pr-2.5 transition-colors"
      >
        {/* Highlight sits behind the square; collapsed it insets to the same 28px
            tile the square occupies, so the square sits flush (no "frame"). */}
        <span className="rail-hl" data-active={active ? "true" : undefined} aria-hidden />
        <span
          className="relative flex size-7 shrink-0 items-center justify-center rounded-md font-departure-mono"
          style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)`, fontSize: "0.6rem" }}
        >
          {issue.id}
        </span>
        <span className="rail-fade relative min-w-0 flex-1 truncate text-body-sm text-secondary-foreground">
          {issue.title}
        </span>
      </button>
      {!expanded && <RailTooltip label={issue.title} />}

      {/* Close / unpin */}
      <button
        type="button"
        onClick={close}
        title="Close"
        aria-label={`Close issue #${issue.id}`}
        className="absolute flex size-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        style={{
          top: expanded ? "50%" : 2,
          right: expanded ? 6 : 4,
          transform: expanded ? "translateY(-50%)" : "none",
          background: "var(--color-standout)",
          color: "var(--color-page)",
        }}
      >
        <X size={11} strokeWidth={3} />
      </button>
    </div>
  );
}
