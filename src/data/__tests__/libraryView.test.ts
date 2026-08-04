import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIBRARY_DENSITY,
  DEFAULT_LIBRARY_LAYOUT,
  LIBRARY_DENSITIES,
  LIBRARY_LAYOUTS,
  asDensity,
  asLayout,
  densityVars,
} from "../libraryView";

describe("library view preferences", () => {
  it("falls back to the default for anything it doesn't recognise", () => {
    // These come out of localStorage, which is only ever as trustworthy as the
    // version of the app that wrote it.
    for (const bad of ["", null, undefined, "compact", "TREE", "{}"]) {
      expect(asLayout(bad)).toBe(DEFAULT_LIBRARY_LAYOUT);
    }
    for (const bad of ["", null, undefined, "list", "Cosy", "tiny"]) {
      expect(asDensity(bad)).toBe(DEFAULT_LIBRARY_DENSITY);
    }
    expect(asLayout("list")).toBe("list");
    expect(asDensity("compact")).toBe("compact");
  });

  it("offers a default that is one of the options", () => {
    expect(LIBRARY_LAYOUTS.map((l) => l.id)).toContain(DEFAULT_LIBRARY_LAYOUT);
    expect(LIBRARY_DENSITIES.map((d) => d.id)).toContain(DEFAULT_LIBRARY_DENSITY);
  });

  it("says what each option costs", () => {
    for (const option of [...LIBRARY_LAYOUTS, ...LIBRARY_DENSITIES]) expect(option.blurb).not.toBe("");
  });

  it("gets denser in every dimension at once", () => {
    // Row height and indent have to move together, or the guide lines drift off
    // the chevrons they are meant to sit under.
    const [comfortable, cosy, compact] = LIBRARY_DENSITIES;
    expect(comfortable.row).toBeGreaterThan(cosy.row);
    expect(cosy.row).toBeGreaterThan(compact.row);
    expect(comfortable.indent).toBeGreaterThan(cosy.indent);
    expect(cosy.indent).toBeGreaterThan(compact.indent);
    expect(comfortable.pad).toBeGreaterThan(cosy.pad);
    expect(cosy.pad).toBeGreaterThan(compact.pad);
  });

  it("leaves room inside the row for the padding it asks for", () => {
    // The height is a floor and the label's own line box is ~20px; a padding that
    // pushes the natural height past the floor makes the setting do nothing —
    // which is exactly how Compact first shipped at 28px.
    for (const d of LIBRARY_DENSITIES) expect(20 + 2 * d.pad).toBeLessThanOrEqual(d.row);
  });

  it("turns a density into the custom properties the tree reads", () => {
    expect(densityVars("compact")).toEqual({
      "--tree-row-h": "26px",
      "--tree-row-py": "2px",
      "--tree-indent": "12px",
    });
    // An unknown density is the default's metrics, not undefined ones.
    expect(densityVars("nonsense" as never)).toEqual(densityVars(DEFAULT_LIBRARY_DENSITY));
  });
});
