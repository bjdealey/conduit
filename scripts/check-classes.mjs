#!/usr/bin/env node
/**
 * check-classes — guards against silently dead utility classes.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/styles/globals.css` is a **pre-compiled** Tailwind artifact that was
 * ported from the marketing site and checked into the repo; Tailwind itself is
 * not a dependency, so nothing regenerates it. A utility class the app uses but
 * that file never emitted is not an error anywhere — it simply does nothing, and
 * the element silently renders with its inherited style. That has already bitten
 * this codebase: `src/styles/app.css` hand-defines ~30 such classes, and a later
 * audit found 14 more that had been missed (one of which collapsed a three-column
 * KPI grid to a single column).
 *
 * WHAT IT DOES
 * ------------
 * Extracts every class token from `className=` in `src/**`, resolves the set of
 * class selectors the shipped stylesheets actually define, and fails when a used
 * class has no rule. Marker classes — used as query/animation hooks rather than
 * for styling — are allow-listed below.
 *
 * Run: `npm run check:classes`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** Stylesheets shipped with the app, in import order. */
const STYLESHEETS = [
  "src/styles/globals.css",
  "src/styles/app.css",
  "src/styles/theme.css",
  "src/styles/logo-wall.css",
  "src/components/Grainient/Grainient.css",
];

/**
 * Classes that intentionally have no style rule: DOM query hooks, state flags
 * toggled from JS, and animation classes driven by inline styles. Adding to this
 * list is a deliberate act — prefer defining the class.
 */
const MARKER_CLASSES = new Set([
  "content-panel", // App.tsx measures this for the sign-in morph
  "login-card", // ditto
  "group", // Tailwind variant parent; carries no rules of its own
]);

/** Variant prefixes that Tailwind resolves at build time (`sm:`, `hover:` …). We
 *  compare the whole token, because that is how the compiled selector is named. */
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(p) && !/__tests__/.test(p)) out.push(p);
  }
  return out;
};

/** Pull the balanced `className=…` expression starting at `i`, then return every
 *  string literal inside it — so conditional class expressions are covered too.
 *
 *  This is a single-pass scanner rather than a regex because the expressions
 *  carry explanatory `//` comments, and an apostrophe in prose ("the button's
 *  width") would otherwise be read as opening a string literal. */
function classNameLiterals(src, i) {
  let j = i;
  while (j < src.length && src[j] !== '"' && src[j] !== "{" && src[j] !== "'") j++;
  if (j >= src.length) return [];
  if (src[j] === '"' || src[j] === "'") {
    const quote = src[j];
    const end = src.indexOf(quote, j + 1);
    return end < 0 ? [] : [src.slice(j + 1, end)];
  }

  // Braced expression: walk to the matching close brace, collecting string
  // literals and skipping over line/block comments as we go.
  const literals = [];
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    const c = src[k], next = src[k + 1];
    if (c === "/" && next === "/") {
      k = src.indexOf("\n", k);
      if (k < 0) break;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", k + 2);
      if (end < 0) break;
      k = end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let buf = "";
      for (let m = k + 1; m < src.length; m++) {
        if (src[m] === "\\") { buf += src[m + 1] ?? ""; m++; continue; }
        if (src[m] === c) { k = m; break; }
        buf += src[m];
      }
      literals.push(buf);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  return literals;
}

// ---- 1. every class token the app uses, with its source location -------------
const used = new Map(); // class -> Set("file:line")
for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const m of src.matchAll(/className=/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    for (const literal of classNameLiterals(src, m.index + m[0].length)) {
      for (const token of literal.split(/\s+/)) {
        // Skip empties and anything with a template hole — we can't resolve those.
        if (!token || token.includes("${")) continue;
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(`${rel}:${line}`);
      }
    }
  }
}

// ---- 2. every class selector the stylesheets define --------------------------
const defined = new Set();
for (const sheet of STYLESHEETS) {
  let css;
  try {
    css = readFileSync(join(ROOT, sheet), "utf8");
  } catch {
    continue; // optional sheet
  }
  for (const m of css.matchAll(/\.((?:[A-Za-z0-9_-]|\\.)+)/g)) {
    defined.add(m[1].replace(/\\(.)/g, "$1")); // unescape \. \[ \] \: \/ \%
  }
}

// ---- 3. report ---------------------------------------------------------------
const missing = [...used.entries()]
  .filter(([cls]) => !defined.has(cls) && !MARKER_CLASSES.has(cls))
  .sort(([a], [b]) => a.localeCompare(b));

if (missing.length === 0) {
  console.log(`check-classes: ${used.size} classes used, all defined across ${STYLESHEETS.length} stylesheets.`);
  process.exit(0);
}

console.error(`check-classes: ${missing.length} class(es) are used but have no rule in any shipped stylesheet.`);
console.error("These render as no-ops. Define them in src/styles/app.css, or add a genuine");
console.error("query-hook class to MARKER_CLASSES in this script.\n");
for (const [cls, where] of missing) {
  console.error(`  ${cls}`);
  for (const w of [...where].slice(0, 4)) console.error(`      ${w}`);
  if (where.size > 4) console.error(`      … +${where.size - 4} more`);
}
process.exit(1);
