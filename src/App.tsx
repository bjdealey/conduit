import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { StoreProvider, useStore } from "./store";
import { Background } from "./components/Background";
import { LoginScreen } from "./components/LoginScreen";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { BottomNav } from "./components/BottomNav";
import { SettingsContent } from "./components/SettingsPanel";
import { Titlebar } from "./components/Titlebar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { WorkflowBuilder } from "./components/WorkflowBuilder";
import { ActivityView } from "./components/ActivityView";
import { IssuesView } from "./components/IssuesView";
import { WorkflowsView } from "./components/WorkflowsView";
import { TriggersView } from "./components/TriggersView";
import { GovernanceView } from "./components/GovernanceView";
import { RunnersView } from "./components/RunnersView";
import { HomeView } from "./components/HomeView";
import { TabStrip } from "./components/TabStrip";
import { defaultSubpage, navItems } from "./data/nav";

/**
 * The phone's way into a destination's subpages.
 *
 * Subpages navigate from the rail, which the phone shell doesn't mount — and the
 * bottom bar gives a destination one slot, which lands on its first subpage. So
 * without this, Triggers and Issues are simply unreachable on a phone: the bar
 * tap goes to Library and Runs, and the overflow sheet only lists the
 * destinations that *didn't* get a slot.
 *
 * A scrolling tab strip is the same control Settings already uses for exactly
 * this reason, and the same one the tabbed pages inside these subpages use — so
 * it costs the reader no new vocabulary.
 */
function SubpageTabs() {
  const { view, subview, openSubview, isMobile } = useStore();
  const subpages = navItems.find((n) => n.id === view)?.subpages;
  if (!isMobile || !subpages?.length) return null;
  return (
    <TabStrip
      ariaLabel={`${navItems.find((n) => n.id === view)?.label ?? ""} sections`}
      segments={subpages.map((sp) => ({ id: sp.id, label: sp.label }))}
      value={subview ?? defaultSubpage(view) ?? subpages[0].id}
      onChange={(id) => openSubview(view, id)}
    />
  );
}

function Body() {
  const { view, subview } = useStore();
  return (
    // No enter animation on a view swap, and no `key={view}` to force one.
    //
    // Navigation is reached from the rail, the bottom bar and ⌘K, dozens of times
    // a session, and a 200ms fade in front of each one is 200ms before the thing
    // you asked for is readable. Motion earns its place by explaining a spatial
    // relationship or a state change; a whole-view swap has neither to explain —
    // the content simply is different now, and the breadcrumb and the nav's active
    // state already say why. The tab strips inside individual views keep their
    // fades, because there the surrounding frame stays put and the fade is what
    // marks which part changed.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SubpageTabs />
      <div className="flex min-h-0 min-w-0 flex-1">
      {view === "home" && <HomeView />}
      {/* A destination with subpages branches here, *before* its views render, so
          neither has to know the other exists — WorkflowsView keeps its tree,
          breadcrumb trail, multi-select and undo without a tab strip bolted on
          above them. A null `subview` means "the first one" (`defaultSubpage`),
          which is what arriving from the bottom bar or ⌘K leaves it as. */}
      {view === "workflows" && (subview === "triggers" ? <TriggersView /> : <WorkflowsView />)}
      {view === "activity" && (subview === "issues" ? <IssuesView /> : <ActivityView />)}
      {view === "governance" && <GovernanceView />}
      {view === "runners" && <RunnersView />}
      {view === "builder" && <WorkflowBuilder />}
      {view === "settings" && <SettingsContent />}
      </div>
    </div>
  );
}

/** A viewport-space rectangle (getBoundingClientRect, trimmed to what we animate). */
type Rect = { top: number; left: number; width: number; height: number };
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/** Morph state handed to <Workspace>: the content panel is driven between
 *  `source` (the login card's rect) and `target` (its own natural rect).
 *  `grown` is the current end of that range; `animating` gates the transitions
 *  (off on the seeded frame, on for the run) so the same machinery plays the
 *  grow (sign-in) and the shrink (sign-out) just by reversing `grown`. */
type Morph = { source: Rect; target: Rect; grown: boolean; animating: boolean };

// Grow duration; kept in sync with the inline transition below and the phase timer.
// 480ms rather than the 560ms this started at: a strong ease-out spends most of
// its distance early, so the morph reads as *longer* than the number suggests, and
// 480 puts it back inside the 200–500ms a surface this size should take.
const MORPH_MS = 480;
// A strong ease-out. The previous curve was cubic-bezier(0.4, 0, 0.2, 1) — an
// ease-in-*out*, which spends its first 100ms barely moving. That is the wrong
// shape for something arriving: it delays the exact moment the user is watching,
// and on the app's first impression at that.
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// The content panel's corner radius (`rounded-2xl`), repeated here because the
// clip-path has to round its own corners to match while it is clipping them.
const PANEL_RADIUS = 16;

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Persistent shell-tinted backdrop. Sits above the animated Grainient and below
 *  all content, so the login screen and the workspace share the same background:
 *  a translucent shell scrim over the gradient (darker in dark mode, lighter in
 *  light mode), or the solid shell colour when the background is disabled. */
function ShellBackdrop() {
  const { backgroundEnabled } = useStore();
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: backgroundEnabled
          ? "color-mix(in srgb, var(--color-shell) 70%, transparent)"
          : "var(--color-shell)",
      }}
    />
  );
}

function Workspace({ morph }: { morph: Morph | null }) {
  const { bordersEnabled, isMobile } = useStore();
  const grown = morph?.grown ?? false;
  const animating = morph?.animating ?? false;

  // While morphing, the content panel is lifted out of flow and driven between the
  // login card's rect and its own. The clip-reveal is the point — the content must
  // not squash or scale, it must be *uncovered* — but the way to get one is not to
  // animate the box.
  //
  // The panel is laid out at its full (target) rect for the whole morph and never
  // resized. Two compositor-friendly properties do the work instead:
  //
  //   • `transform: translate(…)` carries it to where the login card is. Transform
  //     never touches layout, so nothing inside the panel reflows on any frame.
  //   • `clip-path: inset(…)` eats the difference in size from the right and the
  //     bottom, so what remains visible is exactly the card's rect.
  //
  // Together those are indistinguishable from animating top/left/width/height,
  // which is what this did first — four layout properties on the entire app shell,
  // recomputing layout for every descendant, 60 times a second, on the first thing
  // anyone sees. `clip-path` still costs paint; it does not cost layout, and layout
  // was the expensive half. It also means the inner wrapper no longer needs a fixed
  // pixel size to hold its content still, because nothing is moving underneath it.
  //
  // Transitions are gated on `animating` (not `grown`) so the same machinery plays
  // in either direction — grow on sign-in, shrink on sign-out — with the sidebar
  // and content fading with it.
  const dx = morph ? morph.source.left - morph.target.left : 0;
  const dy = morph ? morph.source.top - morph.target.top : 0;
  const clipRight = morph ? Math.max(0, morph.target.width - morph.source.width) : 0;
  const clipBottom = morph ? Math.max(0, morph.target.height - morph.source.height) : 0;

  const mainStyle: CSSProperties | undefined = morph
    ? {
        position: "fixed",
        margin: 0,
        top: morph.target.top,
        left: morph.target.left,
        width: morph.target.width,
        height: morph.target.height,
        zIndex: 3,
        transform: grown ? "translate(0px, 0px)" : `translate(${dx}px, ${dy}px)`,
        clipPath: grown
          ? `inset(0 0 0 0 round ${PANEL_RADIUS}px)`
          : `inset(0 ${clipRight}px ${clipBottom}px 0 round ${PANEL_RADIUS}px)`,
        transition: animating ? `transform ${MORPH_MS}ms ${EASE}, clip-path ${MORPH_MS}ms ${EASE}` : "none",
        willChange: "transform, clip-path",
      }
    : undefined;
  const innerStyle: CSSProperties | undefined = morph
    ? {
        opacity: grown ? 1 : 0,
        transition: animating ? `opacity 0.32s ease ${MORPH_MS * 0.25}ms` : "none",
      }
    : undefined;
  const sidebarStyle: CSSProperties | undefined = morph
    ? { opacity: grown ? 1 : 0, transition: animating ? "opacity 0.34s ease 0.08s" : "none" }
    : undefined;

  // Two shells, one tree. On a phone the rail is replaced by a bottom bar (nearer
  // the thumb, and not costing 56px of a 390px screen), and the content panel
  // goes edge to edge: the inset frame is a desktop luxury that costs a phone
  // ~5% of its width and every rounded corner of its content.
  return (
    <div
      className={
        "relative flex h-full w-full " +
        (isMobile ? "app-shell-mobile flex-col " : "p-2.5 ") +
        (bordersEnabled ? "borders-on" : "")
      }
      style={{ zIndex: 1, background: "transparent" }}
    >
      {!isMobile && (
        <div className="flex shrink-0" style={sidebarStyle}>
          <Sidebar />
        </div>
      )}
      <main
        className={
          "content-panel flex min-w-0 flex-1 flex-col overflow-hidden bg-page " +
          (isMobile ? "" : "ml-2.5 rounded-2xl border-border-default border-[0.5px] shadow-default")
        }
        style={mainStyle}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={innerStyle}>
          <Titlebar />
          <WorkspaceHeader />
          <Body />
        </div>
      </main>
      {isMobile && (
        <div style={sidebarStyle}>
          <BottomNav />
        </div>
      )}
    </div>
  );
}

/**
 * Auth-gated shell. Sign-in and sign-out don't swap screens — the login card and
 * the content panel are the same card transforming. We measure the login card's
 * rect and the content panel's real rect, then animate the panel between them:
 * it grows into the workspace on sign-in and shrinks back into the card on
 * sign-out, with the login card cross-fading and the workspace content fading
 * with the panel size. Both states share <ShellBackdrop>, so the background is
 * continuous.
 *
 * Phases: idle (login | app) → measure (both layers mounted, one hidden, to
 * capture rects) → seed (panel placed at the start rect) → run (panel animates to
 * the end rect) → idle. `dir` picks the direction. Reduced motion skips the morph.
 */
function Shell() {
  const { authed } = useStore();
  const prevAuthed = useRef(authed);
  const [phase, setPhase] = useState<"login" | "measure" | "seed" | "run" | "app">(
    authed ? "app" : "login",
  );
  const [dir, setDir] = useState<"in" | "out">("in");
  const [rects, setRects] = useState<{ source: Rect; target: Rect } | null>(null);

  // React to auth changes: grow in on sign-in, shrink out on sign-out.
  useEffect(() => {
    const was = prevAuthed.current;
    prevAuthed.current = authed;
    if (authed === was) return;
    if (prefersReducedMotion()) {
      setPhase(authed ? "app" : "login");
      setRects(null);
      return;
    }
    setDir(authed ? "in" : "out");
    setPhase("measure");
  }, [authed]);

  // measure → both layers are mounted (one hidden); capture both rects, then seed.
  useLayoutEffect(() => {
    if (phase !== "measure") return;
    const card = document.querySelector(".login-card");
    const panel = document.querySelector(".content-panel");
    if (!card || !panel) {
      setPhase(dir === "in" ? "app" : "login");
      return;
    }
    setRects({ source: rectOf(card), target: rectOf(panel) });
    setPhase("seed");
  }, [phase, dir]);

  // seed → next frame, start the run (so the panel first paints at its start rect).
  useEffect(() => {
    if (phase !== "seed") return;
    const id = requestAnimationFrame(() => setPhase("run"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // run → settle into the destination once the animation finishes.
  useEffect(() => {
    if (phase !== "run") return;
    const t = setTimeout(() => {
      setPhase(dir === "in" ? "app" : "login");
      setRects(null);
    }, MORPH_MS);
    return () => clearTimeout(t);
  }, [phase, dir]);

  const morphing = (phase === "seed" || phase === "run") && rects != null;
  const showApp = phase !== "login";
  const showLogin = phase !== "app";

  // Panel is at the large (grown) end on the app side of the morph: the end of an
  // "in" run and the start ("seed") of an "out" run.
  const grown = phase === "run" ? dir === "in" : dir === "out";
  const morph: Morph | null =
    morphing && rects
      ? { source: rects.source, target: rects.target, grown, animating: phase === "run" }
      : null;

  // Login card is visible while it's the focus: idle-login, and the card-sized
  // end of each run (start of "in", end of "out"). It cross-fades during the run.
  const loginOpacity =
    phase === "run" ? (dir === "out" ? 1 : 0) : phase === "measure" || phase === "seed" ? (dir === "in" ? 1 : 0) : 1;

  return (
    <>
      <Background />
      <ShellBackdrop />
      {showApp && (
        // Hidden during an "in" measure so the full-size workspace never flashes
        // behind the login card while we measure it.
        <div
          className="morph-layer"
          style={{ zIndex: 1, opacity: phase === "measure" && dir === "in" ? 0 : 1 }}
        >
          <Workspace morph={morph} />
          {phase === "app" && <CommandPalette />}
        </div>
      )}
      {showLogin && (
        <div
          className="morph-layer"
          style={{
            zIndex: 2,
            opacity: loginOpacity,
            transition: phase === "run" ? `opacity 0.3s ease ${dir === "out" ? "0.12s" : "0s"}` : "none",
            pointerEvents: phase === "login" ? "auto" : "none",
          }}
        >
          <LoginScreen />
        </div>
      )}
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
