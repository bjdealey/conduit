import type { Role } from "./types";

/**
 * The signed-in user, shown in the account menu and stamped on everything they do.
 *
 * There is no fixture here any more. A fresh install has no idea who you are, so it
 * starts as `NEW_USER` and fills in from the address you sign in with — a hardcoded
 * person was the one piece of someone else's data that survived the clean slate, and
 * it appeared on the very first screen with your name nowhere near it.
 */
export type CurrentUser = {
  name: string;
  email: string;
  /** Avatar initials. Derived from `name` (see `initialsOf`), never typed by hand. */
  initials: string;
  /** Drives permission-gated UI. Admin sees everything. */
  role: Role;
};

/**
 * Avatar initials for a display name: the first letter of the first two words, or
 * the first two letters of a single word. Non-letters are ignored, so "j.doe" and
 * "J Doe" both read "JD".
 *
 * Derived rather than stored, for the same reason a file's kind is read from its
 * extension: rename yourself and the avatar follows, with nothing to disagree about.
 */
export function initialsOf(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/**
 * A starting profile from the address someone signed in with:
 * `ada.lovelace@acme.com` → "Ada Lovelace".
 *
 * Best-effort by design. Splitting a local part on separators and capitalising is
 * right often enough to save typing and wrong often enough that the profile must
 * stay editable — which it is. An address with no usable local part falls back to
 * `NEW_USER`'s name rather than producing an empty one.
 */
export function userFromEmail(email: string, role: Role = "admin"): CurrentUser {
  const trimmed = email.trim();
  const local = trimmed.split("@")[0] ?? "";
  const name =
    local
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || NEW_USER.name;
  return { name, email: trimmed, initials: initialsOf(name), role };
}

/** The account a fresh install has before anything is known about you — what a
 *  provider sign-in produces here, since the prototype has no real OAuth to ask.
 *  Settings → Profile is where it stops being a placeholder. */
export const NEW_USER: CurrentUser = {
  name: "New user",
  email: "",
  initials: initialsOf("New user"),
  role: "admin",
};

/** The line under your name in the account menu. An unset email would otherwise
 *  render as a blank second line, which reads as a rendering fault rather than as
 *  a detail nobody has filled in yet. */
export function emailLine(user: CurrentUser): string {
  return user.email || "No email set";
}
