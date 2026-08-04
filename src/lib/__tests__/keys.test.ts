import { describe, expect, it } from "vitest";
import { isApplePlatform, shortcutFor } from "../keys";

const nav = (props: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } }) =>
  props as unknown as Navigator;

describe("shortcut labels", () => {
  it("names the delete key the way the platform labels it", () => {
    // The tree's handler takes Delete and Backspace both, so each hint points at a
    // key the machine reading it actually has.
    expect(shortcutFor("delete", true).label).toBe("⌫");
    expect(shortcutFor("delete", false).label).toBe("Del");
  });

  it("keeps one label where the two platforms agree", () => {
    expect(shortcutFor("rename", true).label).toBe("F2");
    expect(shortcutFor("rename", false).label).toBe("F2");
    expect(shortcutFor("dismiss", true).label).toBe("Esc");
  });

  it("announces a key name, never a glyph", () => {
    // `aria-keyshortcuts` takes a key token; a screen reader given "⌫" would be
    // reading out a picture of the key rather than naming it.
    for (const apple of [true, false]) {
      expect(shortcutFor("delete", apple).keys).toBe("Delete");
      expect(shortcutFor("rename", apple).keys).toBe("F2");
      expect(shortcutFor("dismiss", apple).keys).toBe("Escape");
    }
  });

  it("prefers userAgentData, falls back to platform, then the user agent", () => {
    expect(isApplePlatform(nav({ userAgentData: { platform: "macOS" }, platform: "Win32" }))).toBe(true);
    expect(isApplePlatform(nav({ userAgentData: { platform: "Windows" }, platform: "MacIntel" }))).toBe(false);
    expect(isApplePlatform(nav({ platform: "MacIntel" }))).toBe(true);
    expect(isApplePlatform(nav({ platform: "iPhone" }))).toBe(true);
    expect(isApplePlatform(nav({ platform: "Linux x86_64" }))).toBe(false);
    expect(isApplePlatform(nav({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" }))).toBe(true);
  });

  it("reads as non-Apple when the navigator says nothing", () => {
    // A hint has to pick a side; the one that names a key every keyboard has is
    // the safer default.
    expect(isApplePlatform(nav({}))).toBe(false);
  });
});
