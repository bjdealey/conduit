import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * A labelled action button — the thing you press to do something, as opposed to
 * a list row, a menu item, a card, or a bare icon control (all of which are their
 * own shapes elsewhere in the app).
 *
 * Two sizes, both already established in the codebase:
 *  - `md` — page and dialog actions (Create automation, Run now, Send). The
 *    default.
 *  - `sm` — the tighter inline action used in the workspace header and other
 *    toolbars, where the button sits in a 32px row.
 *
 * Three variants, which is what a row of actions actually needs: one `solid`
 * primary, an `outlined` secondary, and a `ghost` tertiary (usually Cancel).
 * The builder footer had exactly this trio, hand-written, with the primary on
 * px-3 and the other two on px-2.5 — the kind of 2px difference that only shows
 * up when the three sit side by side, which they do.
 *
 * Icons are passed as children alongside the label; the flex gap handles spacing.
 */
export function Button({
  variant = "outlined",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: "solid" | "outlined" | "ghost";
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizing = size === "sm" ? "px-2.5 py-1 text-body-sm" : "px-3 py-1.5 text-body-sm font-medium";
  const look =
    variant === "solid"
      ? ""
      : variant === "outlined"
        ? "border-border-default border-[0.5px] text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
        : "text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground";
  return (
    <button
      type="button"
      className={`pressable focusable inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg ${sizing} ${look} ${className}`.trim()}
      // The brand fill is a token, so a solid button follows the palette switcher.
      style={variant === "solid" ? { background: "var(--color-brand-solid)", color: "#fff" } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
