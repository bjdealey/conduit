import { Info, PanelRight } from "lucide-react";
import { useStore } from "../store";
import { defaultSubpage, navItems, type Section } from "../data/nav";
import { VIEW_MODES, CONTEXT_LABEL } from "../data/viewLayout";
import { SETTINGS_PAGES, DEFAULT_SETTINGS_PAGE } from "../data/settings";
import { folderTrail } from "../lib/folders";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { Chip } from "./Chip";
import { READINESS_META, readinessOf } from "../data/readiness";
import { SidebarToggle } from "./SidebarToggle";
import { SegmentedControl } from "./SegmentedControl";
import { Avatar } from "./Avatar";

/** Generic segmented presentation switcher, driven by `VIEW_MODES`. Shown for any
 *  section that declares more than one mode (issues board/list, library list/board, …).
 *  Switching to a non-list mode clears the open item so the board/grid shows (the
 *  detail returns only when you click into an item). */
function ViewModeSwitcher({ section }: { section: Section }) {
  const { layout, setLayout, select, selectWorkflow, selectFolder, selectFile, selectRunner, selectRun } = useStore();
  const modes = VIEW_MODES[section];
  if (!modes || modes.length < 2) return null;
  // Switching to the alternate layout clears every page's open item, so each page
  // lands on its board/grid/timeline — not a stale detail — as you move between them.
  const clearAllSelections = () => {
    select(null);
    selectWorkflow(null);
    selectFolder(null);
    selectFile(null);
    selectRunner(null);
    selectRun(null);
  };
  // First mode is always "list"; the second is the page's alternate. The selected
  // segment tracks the global layout, so it persists across pages (only the
  // alternate's label changes: Board vs Grid).
  const value = layout === "list" ? modes[0].id : modes[1].id;
  return (
    <SegmentedControl
      variant="solid"
      ariaLabel="View layout"
      segments={modes.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
      value={value}
      onChange={(id) => {
        const next = id === modes[0].id ? "list" : "alt";
        setLayout(next);
        if (next === "alt") clearAllSelections();
      }}
    />
  );
}

/** Show/hide the right-hand context pane. Consistent across every view that has
 *  one; the label reflects what that view's pane holds. */
function InfoPaneToggle({ label }: { label: string }) {
  const { infoPaneOpen, toggleInfoPane, isMobile } = useStore();
  // On a phone this opens the pane as a bottom sheet rather than revealing a
  // column, so it gets a thumb-sized target and a glyph that isn't a diagram of a
  // layout the phone doesn't have.
  return (
    <button
      type="button"
      onClick={toggleInfoPane}
      aria-pressed={infoPaneOpen}
      aria-label={infoPaneOpen ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      title={infoPaneOpen ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      className={
        "pressable focusable flex items-center justify-center rounded-md transition-colors hover:bg-transparent-hover " +
        (isMobile ? "tap-target" : "size-7")
      }
      style={{
        background: infoPaneOpen ? "var(--color-transparent-hover)" : "transparent",
        color: infoPaneOpen ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
      }}
    >
      {isMobile ? <Info size={20} strokeWidth={1.8} /> : <PanelRight size={16} strokeWidth={1.8} />}
    </button>
  );
}

/** The builder is the one screen with no nav entry to take a label from — it is a
 *  mode you enter from the library, not a destination. Everything else reads its
 *  name off `navItems`, so a rename happens in one place. */
const BUILDER_LABEL = "Workflow builder";

/** The application titlebar: sidebar toggle + a consistent breadcrumb trail for
 *  the current view/selection, plus a shared control cluster (view-mode switch,
 *  info-pane toggle, and contextual actions) pinned to the right. */
export function Titlebar() {
  const {
    view,
    subview,
    section,
    isMobile,
    dataSource,
    selected,
    select,
    selectedWorkflowId,
    selectWorkflow,
    selectedFolderId,
    selectFolder,
    expand,
    selectedFileId,
    selectFile,
    treeSelection,
    setTreeSelection,
    peeking,
    folders,
    files,
    selectedRunnerId,
    selectRunner,
    selectedRunId,
    selectRun,
    runById,
    draft,
    closeBuilder,
    viewMode,
    workflows,
    openSubview,
    members,
    runners,
  } = useStore();

  const openWorkflow = selectedWorkflowId
    ? workflows.find((a) => a.id === selectedWorkflowId) ?? null
    : null;
  const openRunner = selectedRunnerId ? runners.find((r) => r.id === selectedRunnerId) ?? null : null;
  // A folder's trail is its ancestry, so the breadcrumb walks back up the library
  // tree the same way the tree walks down it. Whatever is open gets that trail —
  // a workflow and a file are in the tree too, and "Workflows › Bulk invoice
  // export" told you nothing about where it lives.
  const openFile = selectedFileId ? files.find((f) => f.id === selectedFileId) ?? null : null;
  const folderCrumbs = folderTrail(
    folders,
    selectedFolderId ?? openFile?.folderId ?? openWorkflow?.folderId ?? "",
  );
  // Only the Activity timeline opens a run full-pane; the list layout expands runs
  // in place, so a stale selection never leaks into its breadcrumb.
  const openRun =
    section === "activity/runs" && viewMode("activity/runs") === "timeline" && selectedRunId
      ? runById(selectedRunId) ?? null
      : null;

  /* The trail every screen starts from.
   *
   * A destination with subpages contributes two crumbs, not one: "Governance"
   * alone doesn't say whether you are looking at the review queue or the audit
   * trail, and the rail's group is expanded around exactly this distinction. The
   * destination crumb goes to its first subpage — its main face — so the trail
   * climbs the same way the rail reads. Whatever is open in the section is
   * appended after these by the branches below. */
  const navItem = navItems.find((n) => n.id === view);
  const openSub = navItem?.subpages?.length ? subview ?? defaultSubpage(view) : null;
  const subLabel = navItem?.subpages?.find((sp) => sp.id === openSub)?.label;

  /** `clear` is what returns the section to its own top — closing whatever is
   *  open — and hangs off the last crumb the section owns. */
  const sectionCrumbs = (clear?: () => void): Crumb[] => {
    const label = navItem?.label ?? BUILDER_LABEL;
    if (!subLabel) return [{ label, onClick: clear }];
    const first = defaultSubpage(view);
    return [
      { label, onClick: first ? () => openSubview(view, first) : undefined },
      { label: subLabel, onClick: clear },
    ];
  };

  let items: Crumb[];
  // Whether the current view is showing a right-hand context pane the info toggle
  // can act on — mirrors each view's render conditions so the control is never dead.
  let hasContext = false;
  if (section === "activity/issues") {
    hasContext = !!selected;
    items = selected ? [...sectionCrumbs(() => select(null)), { label: selected.title }] : sectionCrumbs();
  } else if (section === "workflows/library") {
    hasContext = treeSelection.length > 1 || !!openWorkflow || !!openFile || folderCrumbs.length > 0;
    // A peek is what the pane is showing, so it outranks the selection summary here too.
    const showingSelection = treeSelection.length > 1 && !peeking;
    // Every ancestor is a crumb you can climb to; the Breadcrumb renders the last
    // one inert, so whatever is open is the only dead label.
    // Climbing to an ancestor reveals it in the tree as well as opening it — the
    // crumb is a destination, and a destination you can't see isn't one.
    const trail = folderCrumbs.map((f) => ({
      label: f.name,
      onClick: () => {
        expand(f.id);
        selectFolder(f.id);
      },
    }));
    items = showingSelection
      ? // A multi-selection is what the pane is showing, so it is what the trail
        // should name — otherwise the breadcrumb keeps announcing a single row
        // that is no longer what you are looking at.
        [...sectionCrumbs(() => setTreeSelection([])), { label: `${treeSelection.length} selected` }]
      : openWorkflow
      ? [...sectionCrumbs(() => selectWorkflow(null)), ...trail, { label: openWorkflow.name }]
      : openFile
        ? [...sectionCrumbs(() => selectFile(null)), ...trail, { label: openFile.name }]
        : trail.length > 0
          ? [...sectionCrumbs(() => selectFolder(null)), ...trail]
          : sectionCrumbs();
  } else if (view === "settings") {
    const pageId = subview ?? DEFAULT_SETTINGS_PAGE;
    const page = SETTINGS_PAGES.find((p) => p.id === pageId);
    items = [
      { label: "Settings", onClick: () => openSubview("settings", DEFAULT_SETTINGS_PAGE) },
      { label: page?.label ?? "Settings" },
    ];
  } else if (view === "builder") {
    // The builder's trail leads back to the library; its context pane is the
    // step configuration, so the info toggle acts on that.
    hasContext = true;
    items = [
      { label: "Workflows", onClick: closeBuilder },
      { label: draft?.isNew ? "New workflow" : draft?.name || "Untitled workflow" },
    ];
  } else if (section === "activity/runs") {
    hasContext = true;
    items = openRun ? [...sectionCrumbs(() => selectRun(null)), { label: openRun.id }] : sectionCrumbs();
  } else if (view === "runners") {
    hasContext = !!openRunner;
    items = openRunner ? [...sectionCrumbs(() => selectRunner(null)), { label: openRunner.name }] : sectionCrumbs();
  } else {
    items = sectionCrumbs();
  }

  const readiness = readinessOf(section, dataSource);
  // The phone shell drops the two controls that describe the desktop layout: the
  // rail it toggles isn't mounted, and the list/board switch offers a second
  // multi-column presentation on a screen that has room for one. The readiness
  // chip goes too — a claim about the surface, worth its width only when there is
  // width to spare. Everything they control is still reachable from the sheet or
  // the view itself.
  const showSwitcher = !isMobile && (VIEW_MODES[section]?.length ?? 0) > 1;
  const showInfoToggle = hasContext && !!CONTEXT_LABEL[section];
  const showSubscribers = !isMobile && section === "activity/issues" && !!selected;

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-border-default border-b-[0.5px] px-4"
      style={{ height: isMobile ? 52 : 56 }}
    >
      {!isMobile && <SidebarToggle />}
      <Breadcrumb items={items} />
      {/* What this screen actually is. The vision names scheduling, credentials and
          multi-user auth as roadmap, and the app draws all three convincingly — so
          each surface says so rather than letting a complete-looking screen imply a
          promise nobody made. */}
      {!isMobile && readiness !== "prototype" && (
        <span title={READINESS_META[readiness].blurb} className="inline-flex">
          <Chip tone={READINESS_META[readiness].tone} dot={false}>
            {READINESS_META[readiness].label}
          </Chip>
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {showSwitcher && <ViewModeSwitcher section={section} />}

        {showSubscribers && (
          <div className="flex items-center gap-3 pl-1">
            <div className="flex items-center -space-x-1.5">
              {members.map((m) => (
                <div key={m.id} className="rounded-md p-[1.5px]" style={{ background: "var(--color-page)" }}>
                  <Avatar member={m} size={20} />
                </div>
              ))}
            </div>
            <span className="rounded-full bg-component px-2.5 py-1 text-body-sm text-secondary-foreground">
              Subscribed
            </span>
          </div>
        )}

        {showInfoToggle && <InfoPaneToggle label={CONTEXT_LABEL[section] ?? "Details"} />}
      </div>
    </header>
  );
}
