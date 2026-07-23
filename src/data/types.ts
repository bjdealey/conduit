/** Domain model for the Conduit platform prototype. */

export type Priority = "High" | "Medium" | "Low";

/** Workflow states, in the order the inbox groups them. */
export const STATUSES = ["Under Investigation", "Active", "In Recovery", "Resolved"] as const;
export type Status = (typeof STATUSES)[number];

export type Member = {
  id: string;
  /** Two-letter avatar initials, e.g. "LS". */
  initials: string;
  name: string;
  /** Radix accent scale prefix used for the avatar colour, e.g. "cyan". */
  accent: string;
};

export type ActivityKind =
  | "problem"
  | "status"
  | "finding"
  | "fact"
  | "assignment"
  | "priority"
  | "comment"
  | "pr";

export type CodeDiffLine = {
  n: number;
  text: string;
  /** "add" | "del" for diff gutter colouring, undefined for context lines. */
  change?: "add" | "del";
};

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  /** Relative time label as shown in the mockup, e.g. "4 min ago". */
  time: string;
  title: string;
  body?: string;
  /** Optional inline code diff (findings). */
  code?: { file: string; lines: CodeDiffLine[] };
  /** Optional member reference (assignment / comment author). */
  memberId?: string;
  /** Optional non-member author (e.g. a comment posted from the composer). */
  author?: { name: string; initials: string; accent: string };
  /** Optional linked-resource preview card (e.g. a pull request). */
  link?: { title: string; subtitle: string };
};

export type Issue = {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: string;
  surface: string[];
  regression: boolean;
  firstDetection: string;
  latestDetection: string;
  duration: string;
  findingsCount: number;
  impactedUsers: number;
  activity: ActivityEvent[];
};
