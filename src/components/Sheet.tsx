import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* =============================================================================
   Bottom sheet
   -----------------------------------------------------------------------------
   The phone shell's answer to the two things the desktop shell puts in a column
   beside the content: the navigation overflow, and the right-hand context pane.
   Neither fits beside anything at 390px, and neither is worth a whole screen, so
   both slide up over the content and are dismissed the same way.

   Portalled to <body> for the same reason the library's row menus are: the panes
   it opens over are `overflow: hidden` scroll boxes several levels deep, and
   z-index does not survive a clipping ancestor. Leaving the box is the only fix.

   ---- why this one animates, when the command palette doesn't ----------------
   A sheet is an occasional, large, spatially-anchored surface: it comes from the
   bottom edge, and the motion is what says so. The palette is a keyboard action
   reached hundreds of times a day with no spatial story to tell, so it has no
   animation at all. Same product, opposite answers, and the frequency is why.

   ---- and why transitions rather than keyframes -----------------------------
   The sheet is dismissible mid-open, and draggable throughout. A keyframe
   restarts from zero when re-triggered and cannot be retargeted; a transition
   picks up from wherever the panel currently is. Flicking a sheet down while it
   is still rising has to work, because a thumb doesn't wait for an animation.
   ============================================================================= */

/** Enter and exit durations, in ms. Exit is the shorter of the two: opening is a
 *  deliberate act and can afford to be seen, but a dismissal is a response to
 *  something the user has already decided, and making them watch it is a tax.
 *  These are the transition durations *and* the unmount timer — the panel has to
 *  stay mounted for exactly as long as it is still moving. */
const ENTER_MS = 220;
const EXIT_MS = 180;

/** iOS-like drawer curve. Almost all of the movement happens early, so the panel
 *  reads as arriving rather than as travelling. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Past this, a downward flick dismisses however far it actually got — px per ms.
 *  Requiring a *distance* means a fast short flick does nothing, which is the
 *  gesture people actually make once they trust the control. */
const FLING_VELOCITY = 0.11;

/** …and a slow drag dismisses once it has taken the panel this far down. */
const DISMISS_FRACTION = 0.4;

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A modal panel anchored to the bottom of the viewport.
 *
 * Dismissed by the backdrop, the close button, Escape, or a downward drag on its
 * header. Body scroll is locked while open, so a drag on the backdrop doesn't
 * scroll the page behind it. The panel is capped at `maxHeight` and scrolls
 * internally past that — a sheet that grows to the full screen is a screen, and
 * should have been one.
 */
export function Sheet({
  open,
  onClose,
  title,
  maxHeight = "80vh",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's name and shown in the grab-handle row. */
  title: string;
  maxHeight?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Two flags, not one. `render` is whether the panel is in the DOM; `presented`
  // is whether it has been asked to be up. They differ for exactly the length of
  // an animation: on the way in, the panel mounts *down* and is raised a frame
  // later (there is nothing to transition from if it mounts already open), and on
  // the way out it is lowered first and unmounted once it has arrived.
  const [render, setRender] = useState(open);
  const [presented, setPresented] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setPresented(true));
      return () => cancelAnimationFrame(id);
    }
    setPresented(false);
    const t = setTimeout(() => setRender(false), prefersReducedMotion() ? 0 : EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // ---- drag to dismiss ------------------------------------------------------
  // `drag` is how far down the panel has been pulled, in px, or null when no
  // gesture is in flight. It is deliberately not folded into `presented`: a drag
  // is a position, and presentation is an intent.
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{ id: number; startY: number; startAt: number; height: number } | null>(null);

  // Set the instant a flick is judged a dismissal, rather than waiting for the
  // parent to turn `open` off. Without it the release has a visible hitch: the
  // owner's state change lands a tick later, so for one frame the panel is no
  // longer being dragged but is still "presented", and it starts easing back up
  // to zero before reversing and leaving. Committing locally means the exit
  // continues in the direction the thumb was already going.
  const [dismissing, setDismissing] = useState(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Primary pointer only, and only one: a second finger arriving mid-drag would
    // otherwise jump the panel to wherever it landed.
    if (gesture.current || !e.isPrimary) return;
    // The close button lives in the header, and capturing the pointer redirects
    // the follow-up `click` away from it — so a drag surface wrapped around a
    // button silently breaks the button. Anything interactive keeps its events.
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    gesture.current = {
      id: e.pointerId,
      startY: e.clientY,
      // `timeStamp` rather than a clock read: it is the event's own time, so a
      // frame delayed by a slow render doesn't read as a slow flick.
      startAt: e.timeStamp,
      height: panel.current?.getBoundingClientRect().height ?? 0,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.startY;
    // Upward drag is resisted rather than blocked. A hard stop at zero feels like
    // a broken control; rising resistance feels like a real edge, and it still
    // tells you the sheet does not go that way.
    setDrag(dy >= 0 ? dy : dy / 4);
  };

  const endGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    const dy = e.clientY - g.startY;
    const elapsed = Math.max(1, e.timeStamp - g.startAt);
    const velocity = dy / elapsed;
    const dismiss = velocity > FLING_VELOCITY || (g.height > 0 && dy > g.height * DISMISS_FRACTION);

    // Clearing `drag` hands the panel back to the presented/not transition, which
    // eases it either home or off the bottom from wherever the thumb left it.
    setDrag(null);
    if (dismiss) {
      setDismissing(true);
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the sheet. Restoring the previous value rather than
    // clearing it keeps nested opens (nav sheet over a context sheet) honest.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Move focus into the sheet on open, so the keyboard and a screen reader
  // follow the pointer into it rather than staying on the page underneath.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  // Cancel any in-flight gesture if the sheet is closed out from under it (a
  // backdrop tap, Escape) — otherwise the next open inherits a stale start point.
  const dragging = drag !== null && !dismissing;
  useEffect(() => {
    if (!render) {
      gesture.current = null;
      setDrag(null);
      setDismissing(false);
    }
  }, [render]);
  // A sheet reopened after a drag-dismiss must not inherit the outgoing state.
  useEffect(() => {
    if (open) setDismissing(false);
  }, [open]);

  // Where the panel sits this frame: under the thumb if there is one, otherwise
  // wherever its presentation says. `translateY(100%)` is relative to the panel's
  // own height, so it parks exactly off the bottom edge whatever it contains.
  const transform =
    dismissing || !presented
      ? "translateY(100%)"
      : dragging
        ? `translateY(${Math.max(0, drag)}px)`
        : "translateY(0)";

  if (!render || typeof document === "undefined") return null;

  return createPortal(
    <div className="sheet-root" role="presentation">
      <div
        className="sheet-backdrop"
        onClick={onClose}
        aria-hidden
        style={{
          opacity: presented && !dismissing ? 1 : 0,
          transition: `opacity ${presented && !dismissing ? ENTER_MS : EXIT_MS}ms ease`,
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="sheet-panel"
        style={{
          maxHeight,
          transform,
          // No transition while a thumb is on it: the panel must track the finger
          // exactly, and any easing here reads as the sheet lagging behind the
          // gesture. The transition returns on release, which is what eases it
          // home or off the bottom.
          transition: dragging
            ? "none"
            : `transform ${presented && !dismissing ? ENTER_MS : EXIT_MS}ms ${EASE}`,
        }}
      >
        <div
          className="sheet-header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          // The header is the drag surface, so it must not also be a scroll or
          // text-selection surface while a drag is in flight.
          style={{ touchAction: "none" }}
        >
          <span className="sheet-grip" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-body-base font-medium text-primary-foreground">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="pressable focusable tap-target flex items-center justify-center rounded-lg text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
