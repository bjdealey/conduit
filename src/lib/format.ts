/** Thousands-separated integer, e.g. 12881 -> "12,881". */
export const num = (n: number) => n.toLocaleString("en-US");

/* =============================================================================
   Relative-time parsing
   -----------------------------------------------------------------------------
   The prototype's seed data carries times as the label the UI shows ("36 minutes
   ago", "2 min 10 s") rather than timestamps. Charting runs on a time axis (the
   Activity timeline) needs those labels back as numbers, so these read them.
   Anything unparseable returns null — callers treat that as "not started" /
   "unknown", never as zero.
   ============================================================================= */

/** Minutes in one unit of a relative-time label, keyed by its singular form. */
const UNIT_MINUTES: Record<string, number> = {
  s: 1 / 60,
  sec: 1 / 60,
  second: 1 / 60,
  m: 1,
  min: 1,
  minute: 1,
  h: 60,
  hr: 60,
  hour: 60,
  d: 1440,
  day: 1440,
};

/** Singular form of a unit word ("minutes" -> "minute"); single letters are left
 *  alone so "s" stays seconds. */
const singular = (unit: string) => (unit.length > 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit);

/**
 * How many minutes ago a relative label refers to, e.g. "36 minutes ago" -> 36,
 * "2 hours ago" -> 120, "just now" -> 0. Returns null for labels that name no
 * point in time ("queued", "—").
 */
export function minutesAgo(label: string): number | null {
  const text = label.trim().toLowerCase();
  if (text === "just now" || text === "now") return 0;
  if (text === "yesterday") return 1440;
  const match = /^(?:an?|(\d+(?:\.\d+)?))\s*([a-z]+)\s+ago$/.exec(text);
  if (!match) return null;
  const unit = UNIT_MINUTES[singular(match[2])];
  if (unit === undefined) return null;
  return (match[1] === undefined ? 1 : Number(match[1])) * unit;
}

/** Every `<number> <unit>` pair in a duration label, e.g. "2 min 10 s". */
const DURATION_PART = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;

/**
 * Seconds in a duration label, e.g. "48 s" -> 48, "2 min 10 s" -> 130. Returns
 * null when the label carries no duration ("—").
 */
export function durationSeconds(label: string): number | null {
  let total: number | null = null;
  for (const [, value, unit] of label.trim().toLowerCase().matchAll(DURATION_PART)) {
    const minutes = UNIT_MINUTES[singular(unit)];
    if (minutes === undefined) continue;
    total = (total ?? 0) + Number(value) * minutes * 60;
  }
  return total;
}

/** Compact age label for a time axis: 0 -> "now", 45 -> "45m", 240 -> "4h". */
export function agoLabel(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}
