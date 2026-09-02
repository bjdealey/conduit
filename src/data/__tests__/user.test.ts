import { describe, expect, it } from "vitest";
import { NEW_USER, emailLine, initialsOf, userFromEmail } from "../user";

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("Ada Byron Lovelace")).toBe("AB");
  });

  it("takes two letters from a single word", () => {
    expect(initialsOf("Ada")).toBe("AD");
    expect(initialsOf("A")).toBe("A");
  });

  it("ignores separators, so a name and the address it came from agree", () => {
    expect(initialsOf("ada.lovelace")).toBe("AL");
    expect(initialsOf("ada_lovelace")).toBe("AL");
    expect(initialsOf("  Ada   Lovelace  ")).toBe("AL");
  });

  it("never returns an empty string — an avatar always has something in it", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf("!!!")).toBe("?");
  });
});

describe("userFromEmail", () => {
  it("builds a name from the local part", () => {
    expect(userFromEmail("ada.lovelace@acme.com")).toMatchObject({
      name: "Ada Lovelace",
      email: "ada.lovelace@acme.com",
      initials: "AL",
    });
  });

  it("handles the separators addresses actually use", () => {
    expect(userFromEmail("ada_lovelace@acme.com").name).toBe("Ada Lovelace");
    expect(userFromEmail("ada-lovelace@acme.com").name).toBe("Ada Lovelace");
    expect(userFromEmail("ada@acme.com").name).toBe("Ada");
  });

  it("trims, so a pasted address doesn't become part of the name", () => {
    expect(userFromEmail("  ada@acme.com  ").email).toBe("ada@acme.com");
  });

  it("falls back rather than producing a nameless account", () => {
    // Nothing usable in the local part; better a placeholder you can see and
    // correct than a blank name on every avatar in the app.
    expect(userFromEmail("@acme.com").name).toBe(NEW_USER.name);
    expect(userFromEmail("").name).toBe(NEW_USER.name);
  });

  it("keeps the tier it is given", () => {
    expect(userFromEmail("ada@acme.com", "builder").role).toBe("builder");
    expect(userFromEmail("ada@acme.com").role).toBe("admin");
  });
});

describe("the account a fresh install starts with", () => {
  it("names nobody real", () => {
    // The regression this guards: a hardcoded person shipped as the signed-in
    // user, greeting everyone by a name that was never theirs.
    expect(NEW_USER.email).toBe("");
    expect(NEW_USER.name).toBe("New user");
  });

  it("says so rather than showing a blank line", () => {
    expect(emailLine(NEW_USER)).toBe("No email set");
    expect(emailLine(userFromEmail("ada@acme.com"))).toBe("ada@acme.com");
  });
});
