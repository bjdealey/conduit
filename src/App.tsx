import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { StoreProvider, useStore } from "./store";
import { Background } from "./components/Background";
import { LoginScreen } from "./components/LoginScreen";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { SettingsContent } from "./components/SettingsPanel";
import { Titlebar } from "./components/Titlebar";
import { Inbox } from "./components/Inbox";
import { Board } from "./components/Board";
import { IssueDetail } from "./components/IssueDetail";
import { ActivityView } from "./components/Views";
import { UsersView } from "./components/UsersView";
import { SurfacesView } from "./components/SurfacesView";
import { EnvironmentsView } from "./components/EnvironmentsView";

function InboxView() {
  const { selected, inboxLayout } = useStore();

  // Board layout: the kanban fills the panel; selecting a card opens the issue
  // full-width (deselect returns to the board).
  if (inboxLayout === "board") {
    return selected ? <IssueDetail issue={selected} /> : <Board />;
  }

  // List layout: the grouped inbox on the left, detail (or a hint) on the right.
  return (
    <>
      <Inbox />
      {selected ? (
        <IssueDetail issue={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-body-base text-tertiary-foreground">
          Select an issue from the inbox.
        </div>
      )}
    </>
  );
}

function Body() {
  const { view } = useStore();
  return (
    <div key={view} className="animate-in fade-in-0 duration-200 ease-out flex min-h-0 flex-1">
      {view === "activity" && <ActivityView />}
      {view === "inbox" && <InboxView />}
      {view === "users" && <UsersView />}
      {view === "surfaces" && <SurfacesView />}
      {view === "environments" && <EnvironmentsView />}
      {view === "settings" && <SettingsContent />}
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
const MORPH_MS = 560;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

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
  const { bordersEnabled } = useStore();
  const grown = morph?.grown ?? false;
  const animating = morph?.animating ?? false;
  const rect = morph ? (grown ? morph.target : morph.source) : null;

  // While morphing, the content panel is lifted out of flow and its box is
  // animated between the login card's rect and its own; `overflow: hidden` + a
  // fixed-size inner wrapper means the content is clip-revealed (a real
  // transform) rather than scaled. Transitions are gated on `animating` (not
  // `grown`) so it plays in either direction — grow on sign-in, shrink on
  // sign-out — with the sidebar/content fading with the panel size.
  const mainStyle: CSSProperties | undefined =
    morph && rect
      ? {
          position: "fixed",
          margin: 0,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 3,
          transition: animating
            ? `top ${MORPH_MS}ms ${EASE}, left ${MORPH_MS}ms ${EASE}, width ${MORPH_MS}ms ${EASE}, height ${MORPH_MS}ms ${EASE}`
            : "none",
        }
      : undefined;
  const innerStyle: CSSProperties | undefined = morph
    ? {
        width: morph.target.width,
        height: morph.target.height,
        opacity: grown ? 1 : 0,
        transition: animating ? "opacity 0.36s ease 0.14s" : "none",
      }
    : undefined;
  const sidebarStyle: CSSProperties | undefined = morph
    ? { opacity: grown ? 1 : 0, transition: animating ? "opacity 0.4s ease 0.1s" : "none" }
    : undefined;

  return (
    <div
      className={"relative flex h-full w-full p-2.5 " + (bordersEnabled ? "borders-on" : "")}
      style={{ zIndex: 1, background: "transparent" }}
    >
      <div className="flex shrink-0" style={sidebarStyle}>
        <Sidebar />
      </div>
      <main
        className="content-panel ml-2.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border-border-default border-[0.5px] bg-page shadow-default"
        style={mainStyle}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={innerStyle}>
          <Titlebar />
          <Body />
        </div>
      </main>
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
