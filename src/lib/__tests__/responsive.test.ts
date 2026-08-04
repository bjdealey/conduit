import { describe, expect, it } from "vitest";
import { splitDestinations } from "../responsive";

/* The bottom bar's contents are a rule, not a layout accident: the bar is built
   from the gated nav list, so a destination the current tier or capability set
   hides must never take a slot, and whatever doesn't fit has to land in the
   overflow rather than disappearing. Testing that through a rendered nav would
   prove far less than testing it here. */

type Item = { id: string };
const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));

describe("splitDestinations", () => {
  it("promotes the named destinations, in bar order", () => {
    const { bar } = splitDestinations(items("home", "activity", "inbox", "workflows"), ["workflows", "home"], 4);
    expect(bar.map((i) => i.id)).toEqual(["workflows", "home"]);
  });

  it("puts everything it didn't promote in the overflow, in list order", () => {
    const { overflow } = splitDestinations(
      items("home", "activity", "inbox", "workflows", "settings"),
      ["home", "workflows"],
      4,
    );
    expect(overflow.map((i) => i.id)).toEqual(["activity", "inbox", "settings"]);
  });

  it("stops at `max` and overflows the rest — a bar of six is a bar of six targets too small to hit", () => {
    const { bar, overflow } = splitDestinations(
      items("a", "b", "c", "d", "e"),
      ["a", "b", "c", "d", "e"],
      3,
    );
    expect(bar.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(overflow.map((i) => i.id)).toEqual(["d", "e"]);
  });

  it("skips a named destination the caller filtered out, rather than leaving a gap", () => {
    // `items` arrives already role- and capability-gated: "audit" is named for the
    // bar but hidden for this tier, so the slot goes to the next one that exists.
    const { bar, overflow } = splitDestinations(items("home", "inbox"), ["home", "audit", "inbox"], 4);
    expect(bar.map((i) => i.id)).toEqual(["home", "inbox"]);
    expect(overflow).toEqual([]);
  });

  it("loses nothing: every item lands in exactly one of the two", () => {
    const all = items("home", "activity", "inbox", "workflows", "review", "settings");
    const { bar, overflow } = splitDestinations(all, ["home", "workflows", "activity", "inbox"], 4);
    expect([...bar, ...overflow].map((i) => i.id).sort()).toEqual(all.map((i) => i.id).sort());
    expect(bar.filter((i) => overflow.includes(i))).toEqual([]);
  });

  it("promotes nothing when the bar is empty", () => {
    const { bar, overflow } = splitDestinations(items("home", "inbox"), [], 4);
    expect(bar).toEqual([]);
    expect(overflow.map((i) => i.id)).toEqual(["home", "inbox"]);
  });
});
