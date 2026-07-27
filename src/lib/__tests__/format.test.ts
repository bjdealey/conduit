import { describe, expect, it } from "vitest";
import { agoLabel, durationSeconds, minutesAgo, num } from "../format";
import { runs } from "../../data/automations";

describe("relative-time parsing (seed labels → numbers for the Activity timeline)", () => {
  it("reads the relative labels the run seed data uses", () => {
    expect(minutesAgo("just now")).toBe(0);
    expect(minutesAgo("2 minutes ago")).toBe(2);
    expect(minutesAgo("36 minutes ago")).toBe(36);
    expect(minutesAgo("2 hours ago")).toBe(120);
    expect(minutesAgo("an hour ago")).toBe(60);
    expect(minutesAgo("yesterday")).toBe(1440);
    expect(minutesAgo("30 seconds ago")).toBe(0.5);
  });

  it("returns null for labels that name no point in time", () => {
    expect(minutesAgo("queued")).toBeNull();
    expect(minutesAgo("—")).toBeNull();
    expect(minutesAgo("3 parsecs ago")).toBeNull();
    expect(minutesAgo("")).toBeNull();
  });

  it("sums the parts of a duration label", () => {
    expect(durationSeconds("48 s")).toBe(48);
    expect(durationSeconds("2 min 10 s")).toBe(130);
    expect(durationSeconds("3 s")).toBe(3);
    expect(durationSeconds("1 h 4 min")).toBe(3840);
  });

  it("returns null when a duration is unknown", () => {
    expect(durationSeconds("—")).toBeNull();
    expect(durationSeconds("")).toBeNull();
  });

  it("labels an age compactly for a time axis", () => {
    expect(agoLabel(0)).toBe("now");
    expect(agoLabel(45)).toBe("45m");
    expect(agoLabel(240)).toBe("4h");
    expect(agoLabel(90)).toBe("1.5h");
  });

  it("parses every run in the seed data (the timeline plots them all)", () => {
    for (const run of runs) {
      // A run either has a start time, or is queued (not started yet).
      if (run.state === "Queued") continue;
      expect(minutesAgo(run.startedAt), `${run.id} startedAt`).not.toBeNull();
      expect(durationSeconds(run.duration), `${run.id} duration`).not.toBeNull();
    }
  });

  it("formats thousands", () => {
    expect(num(12881)).toBe("12,881");
  });
});
