import { useState } from "react";
import { ScrollText } from "lucide-react";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABEL,
  orderAudit,
  type AuditCategory,
  type AuditEntry,
} from "@conduit/domain";
import { useStore } from "../store";
import { PLATFORM_LABEL, type WorkflowPlatform } from "../data/types";
import { Chip } from "./Chip";
import { TabStrip } from "./TabStrip";
import { DetailPane } from "./layout/SplitView";
import { isNarrowed, matchesQuery } from "../lib/workspace";

/* =============================================================================
   Audit — who did what, and when
   -----------------------------------------------------------------------------
   Parity work: the Control Room has an audit log and a replacement without one
   is not a replacement. But the tier model is what makes it load-bearing. Once
   citizen builders submit and professionals promote, "who approved this" stops
   being a nice-to-have and becomes the thing that makes delegation defensible.

   One trail across both estates. A mirrored Control Room action and a native
   approval sit in the same list, distinguished by platform — the same promise
   the library makes, applied to history.

   Append-only: this view reads, and there is no control here that edits a row.
   ============================================================================= */

const CATEGORY_ACCENT: Record<AuditCategory, string> = {
  lifecycle: "blue",
  execution: "gray",
  governance: "violet",
  connector: "cyan",
};

const TABS = ["All", ...AUDIT_CATEGORIES.map((c) => AUDIT_CATEGORY_LABEL[c])] as const;
type Tab = (typeof TABS)[number];

/** The category a tab shows, or null for All. */
function categoryOfTab(tab: Tab): AuditCategory | null {
  return AUDIT_CATEGORIES.find((c) => AUDIT_CATEGORY_LABEL[c] === tab) ?? null;
}

function Entry({ entry, last }: { entry: AuditEntry; last: boolean }) {
  return (
    <div className={"flex items-start gap-3 py-3 border-border-default " + (last ? "" : "border-b-[0.5px]")}>
      <span className="mt-0.5 shrink-0">
        <Chip tone={CATEGORY_ACCENT[entry.category]} mono>
          {entry.category}
        </Chip>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <span className="text-body-sm text-primary-foreground">
          <span className="font-medium">{entry.actor}</span> {entry.action}{" "}
          <span className="text-secondary-foreground">{entry.target}</span>
        </span>
        {entry.detail && <span className="text-[0.72rem] text-tertiary-foreground">{entry.detail}</span>}
      </div>
      {entry.platform !== "conduit" && (
        <span className="shrink-0 text-[0.7rem] text-tertiary-foreground">
          {PLATFORM_LABEL[entry.platform as WorkflowPlatform] ?? entry.platform}
        </span>
      )}
      <span className="w-24 shrink-0 text-right font-departure-mono text-[0.7rem] text-tertiary-foreground">
        {entry.at}
      </span>
    </div>
  );
}

/** Audit — the append-only trail, filtered by category. */
export function AuditView() {
  const { audit, controls, allowed } = useStore();
  const [tab, setTab] = useState<Tab>("All");
  const state = controls("audit");

  if (!allowed("review")) {
    return (
      <DetailPane>
        <p className="flex flex-1 items-center justify-center px-6 text-center text-body-sm text-tertiary-foreground">
          The audit trail is visible to professionals and admins.
        </p>
      </DetailPane>
    );
  }

  const category = categoryOfTab(tab);
  const rows = orderAudit(
    audit.filter(
      (e) =>
        (category === null || e.category === category) &&
        matchesQuery(state.query, [e.actor, e.action, e.target, e.detail, e.platform]),
    ),
  );

  const countFor = (t: Tab) => {
    const c = categoryOfTab(t);
    return c === null ? audit.length : audit.filter((e) => e.category === c).length;
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TabStrip
        ariaLabel="Audit categories"
        segments={TABS.map((t) => ({ id: t, label: t, badge: countFor(t) }))}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
      />
      <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-center gap-2 text-body-sm text-tertiary-foreground">
            <ScrollText size={15} strokeWidth={1.8} />
            Append-only. Every lifecycle move writes one entry, across both platforms.
          </div>
          {rows.length === 0 ? (
            <p className="py-16 text-center text-body-sm text-tertiary-foreground">
              {isNarrowed(state) ? "Nothing matches the current search." : "Nothing recorded in this category yet."}
            </p>
          ) : (
            <div className="flex flex-col rounded-xl border-border-default border-[0.5px] bg-page px-4 shadow-default">
              {rows.map((e, i) => (
                <Entry key={e.id} entry={e} last={i === rows.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
