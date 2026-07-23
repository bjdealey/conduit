import { type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { useStore } from "../store";
import { RailTooltip } from "./RailTooltip";

const iconBase: CSSProperties = {
  position: "absolute",
  transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease",
};

/** Single sun/moon button that animates (rotate + crossfade) between light and
 *  dark on click. Sun = light mode, moon = dark mode. */
export function ThemeToggle() {
  const { dark, toggleTheme } = useStore();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      aria-pressed={dark}
      className="group pressable focusable relative flex shrink-0 items-center justify-center rounded-lg text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
      style={{ width: 36, height: 36 }}
    >
      <span className="relative flex items-center justify-center" style={{ width: 18, height: 18 }}>
        {/* Sun (light mode) */}
        <Sun
          size={18}
          strokeWidth={1.8}
          style={{
            ...iconBase,
            opacity: dark ? 0 : 1,
            transform: dark ? "rotate(90deg) scale(0.4)" : "rotate(0deg) scale(1)",
          }}
        />
        {/* Moon (dark mode) */}
        <Moon
          size={18}
          strokeWidth={1.8}
          style={{
            ...iconBase,
            opacity: dark ? 1 : 0,
            transform: dark ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.4)",
          }}
        />
      </span>
      <RailTooltip label={dark ? "Light mode" : "Dark mode"} />
    </button>
  );
}
