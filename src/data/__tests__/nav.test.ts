import { describe, expect, it } from "vitest";
import { SECTIONS, defaultSubpage, navItems, sectionOf } from "../nav";
import { readinessOf } from "../readiness";
import { workspaceControls } from "../workspaceControls";

/* The nav table is the single source for three things that used to be written out
   separately — the rail, the phone's sheet, and the command palette — plus the
   `Section` key every per-screen mechanism is now indexed by. These pin the
   invariants that keeps the four in step. */

describe("sections", () => {
  it("names every subpage of every destination, plus the builder", () => {
    const expected = navItems.flatMap((item) =>
      item.subpages?.length ? item.subpages.map((s) => `${item.id}/${s.id}`) : [item.id],
    );
    expect(SECTIONS).toEqual([...expected, "builder"]);
  });

  it("gives every section a readiness, so no screen can imply a promise nobody made", () => {
    // `readinessOf` reads a total record, so a section with no entry comes back
    // undefined and takes the titlebar down when it indexes the chip's metadata.
    for (const section of SECTIONS) {
      expect(readinessOf(section, "seed"), section).toBeDefined();
    }
  });
});

describe("sectionOf", () => {
  it("reads a null subview as the destination's first subpage", () => {
    expect(sectionOf("workflows", null)).toBe("workflows/library");
    expect(sectionOf("governance", null)).toBe("governance/review");
    expect(sectionOf("governance", "audit")).toBe("governance/audit");
  });

  it("ignores a subview the destination doesn't declare", () => {
    // Settings reuses `subview` for its own page list, which are not sections.
    // Trusting it minted "settings/resources" — a section that exists nowhere, so
    // every lookup keyed by it missed and the readiness chip crashed the titlebar.
    expect(sectionOf("settings", "resources")).toBe("settings");
    expect(sectionOf("home", "anything")).toBe("home");
    // And a stale subpage id on a destination that *does* have subpages falls back
    // rather than naming a section that isn't there.
    expect(sectionOf("workflows", "no-such-subpage")).toBe("workflows/library");
  });

  it("only ever returns a section that exists", () => {
    const pairs = navItems.flatMap((item) => [
      [item.id, null] as const,
      [item.id, "bogus"] as const,
      ...(item.subpages ?? []).map((s) => [item.id, s.id] as const),
    ]);
    for (const [view, sub] of pairs) {
      expect(SECTIONS, `${view}/${sub}`).toContain(sectionOf(view, sub));
    }
  });
});

describe("destinations with subpages", () => {
  it("declares a default subpage exactly when it has subpages", () => {
    for (const item of navItems) {
      expect(defaultSubpage(item.id), item.id).toBe(item.subpages?.[0]?.id ?? null);
    }
  });

  it("puts the controls on the subpages, never on the bare destination", () => {
    // The reason `Section` exists. A destination that holds several screens has no
    // controls of its own — asking for them by view would silently return one
    // subpage's search box for all of them.
    for (const item of navItems) {
      if (!item.subpages?.length) continue;
      expect(workspaceControls(item.id as never, ""), item.id).toBeNull();
    }
  });
});
