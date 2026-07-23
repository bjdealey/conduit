/** End users monitored by Conduit (distinct from `members`, who are the team).
 *  Each carries a session history whose events can reference problems (issues). */

export type SessionEventKind = "visit" | "leave" | "error" | "network" | "click";

export type SessionEvent = {
  id: string;
  kind: SessionEventKind;
  label: string;
  /** Elapsed timestamp within the session, e.g. "00:01:42". */
  time: string;
  /** Links the event to a problem (issue id) when it produced one. */
  problemId?: number;
};

export type Device = {
  os: "apple" | "windows" | "android";
  browser: "chrome" | "safari" | "firefox";
};

export type UserSession = {
  id: string;
  /** Group key / calendar day, e.g. "January 28, 2026". */
  date: string;
  startedAt: string;
  duration: string;
  device: Device;
  events: SessionEvent[];
};

export type EndUser = {
  id: string;
  name: string;
  initials: string;
  /** Radix accent scale prefix for the avatar colour. */
  accent: string;
  email: string;
  country: string;
  countryFlag: string;
  source: string;
  surfaces: string[];
  firstSeen: string;
  firstSeenTime: string;
  lastSeen: string;
  lastSeenTime: string;
  sessionCount: number;
  activeProblemIds: number[];
  sessions: UserSession[];
};

/** Build the recurring five-event shape shown in the mockup, with per-session ids. */
const events = (sid: string, errorProblemId?: number): SessionEvent[] => [
  { id: `${sid}-1`, kind: "visit", label: "Visited /pricing", time: "00:01:42" },
  { id: `${sid}-2`, kind: "leave", label: "Left /pricing", time: "00:02:08" },
  { id: `${sid}-3`, kind: "error", label: "Uncaught type error", time: "00:02:08", problemId: errorProblemId },
  { id: `${sid}-4`, kind: "network", label: "Network update", time: "00:02:08" },
  { id: `${sid}-5`, kind: "click", label: 'Clicked on "Submit"', time: "00:02:36" },
];

const session = (
  id: string,
  date: string,
  startedAt: string,
  duration: string,
  device: Device,
  problemId?: number,
): UserSession => ({ id, date, startedAt, duration, device, events: events(id, problemId) });

const apple = (browser: Device["browser"] = "chrome"): Device => ({ os: "apple", browser });
const windows = (browser: Device["browser"] = "chrome"): Device => ({ os: "windows", browser });
const android = (browser: Device["browser"] = "chrome"): Device => ({ os: "android", browser });

export const endUsers: EndUser[] = [
  {
    id: "alva",
    name: "Alva Hartmann",
    initials: "AH",
    accent: "grass",
    email: "alva.hartmann@email.com",
    country: "United States",
    countryFlag: "🇺🇸",
    source: "Clerk",
    surfaces: ["Website Frontend", "iOS App"],
    firstSeen: "January 12, 2026",
    firstSeenTime: "11:55 am",
    lastSeen: "March 3, 2026",
    lastSeenTime: "07:18 am",
    sessionCount: 78,
    activeProblemIds: [120],
    sessions: [
      session("j45r", "January 28, 2026", "11:44 AM", "23 min", apple("chrome"), 120),
      session("k92p", "January 28, 2026", "09:12 AM", "12 min", apple("chrome"), 120),
      session("m18x", "January 27, 2026", "04:31 PM", "23 min", apple("chrome"), 120),
      session("q73b", "January 27, 2026", "01:02 PM", "8 min", apple("safari")),
      session("t20a", "January 25, 2026", "10:20 AM", "31 min", apple("chrome"), 120),
    ],
  },
  {
    id: "milan",
    name: "Milan Novak",
    initials: "MN",
    accent: "cyan",
    email: "milan.novak@email.com",
    country: "Germany",
    countryFlag: "🇩🇪",
    source: "Clerk",
    surfaces: ["Website Frontend"],
    firstSeen: "December 2, 2025",
    firstSeenTime: "08:41 am",
    lastSeen: "February 27, 2026",
    lastSeenTime: "05:52 pm",
    sessionCount: 41,
    activeProblemIds: [108],
    sessions: [
      session("b31d", "January 28, 2026", "02:15 PM", "17 min", windows("chrome"), 108),
      session("c88k", "January 26, 2026", "11:03 AM", "6 min", windows("firefox")),
      session("d40m", "January 24, 2026", "06:47 PM", "22 min", windows("chrome"), 108),
    ],
  },
  {
    id: "rafa",
    name: "Rafaela Costa",
    initials: "RC",
    accent: "amber",
    email: "rafaela.costa@email.com",
    country: "Brazil",
    countryFlag: "🇧🇷",
    source: "Auth0",
    surfaces: ["iOS App"],
    firstSeen: "January 3, 2026",
    firstSeenTime: "03:22 pm",
    lastSeen: "March 1, 2026",
    lastSeenTime: "12:09 pm",
    sessionCount: 55,
    activeProblemIds: [65, 120],
    sessions: [
      session("f17z", "January 28, 2026", "07:58 AM", "14 min", android("chrome"), 65),
      session("g52w", "January 27, 2026", "09:33 PM", "19 min", android("chrome"), 120),
      session("h09v", "January 23, 2026", "05:11 PM", "9 min", android("chrome")),
    ],
  },
];
