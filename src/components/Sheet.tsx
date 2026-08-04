import { useEffect, useRef, type ReactNode } from "react";
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
   ============================================================================= */

/**
 * A modal panel anchored to the bottom of the viewport.
 *
 * Dismissed by the backdrop, the close button, or Escape. Body scroll is locked
 * while open, so a drag on the backdrop doesn't scroll the page behind it. The
 * panel is capped at `maxHeight` and scrolls internally past that — a sheet that
 * grows to the full screen is a screen, and should have been one.
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="sheet-root" role="presentation">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="sheet-panel"
        style={{ maxHeight }}
      >
        <div className="sheet-header">
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
