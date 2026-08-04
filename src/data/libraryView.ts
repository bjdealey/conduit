/* =============================================================================
   How the library draws itself
   -----------------------------------------------------------------------------
   Two preferences, declared as data so the settings pickers, the store's
   persistence and the tree's CSS all read one table rather than three copies of
   the same list.

   The metrics are custom properties, not classes: a density has to reach the
   row height, the indent step *and* the indent guides, and the guides are drawn
   from the indent step (see `.tree-row` in `app.css`). One variable keeps the
   line under the chevron at every density; three classes would drift.
   ============================================================================= */

/** Whether the library draws its folders, or lists the work inside them. */
export type LibraryLayout = "tree" | "list";

/** How much room a row takes. */
export type LibraryDensity = "comfortable" | "cosy" | "compact";

/** One selectable option, with the sentence that says what choosing it costs. */
export type LibraryOption<T extends string> = { id: T; label: string; blurb: string };

export const LIBRARY_LAYOUTS: LibraryOption<LibraryLayout>[] = [
  {
    id: "tree",
    label: "Tree",
    blurb: "Folders you open, with a guide line down each branch.",
  },
  {
    id: "list",
    label: "Flat list",
    blurb: "Every workflow and file at once, each showing the folder it lives in. Folders aren't rows in this layout, so creating, renaming or deleting one means switching back.",
  },
];

/** Row height, the padding inside it, and the indent step, in pixels.
 *
 *  Density is spacing, not type: the label stays at the body size in all three,
 *  because a list you can't read at a glance isn't denser, it's smaller.
 *
 *  `pad` is here rather than left to a class because the height is a *minimum* —
 *  a flat-list row carries two lines and has to grow past it. With a fixed
 *  padding, Compact's 26px floor sat under a 28px natural height and did
 *  nothing: the label's own line box plus its padding was already taller. */
export const LIBRARY_DENSITIES: (LibraryOption<LibraryDensity> & { row: number; pad: number; indent: number })[] = [
  { id: "comfortable", label: "Comfortable", blurb: "Roomy rows.", row: 36, pad: 6, indent: 16 },
  { id: "cosy", label: "Cosy", blurb: "The default.", row: 32, pad: 4, indent: 14 },
  { id: "compact", label: "Compact", blurb: "As many rows as will fit.", row: 26, pad: 2, indent: 12 },
];

export const DEFAULT_LIBRARY_LAYOUT: LibraryLayout = "tree";
export const DEFAULT_LIBRARY_DENSITY: LibraryDensity = "cosy";

/** The custom properties a density sets on the tree container. */
export function densityVars(density: LibraryDensity): {
  "--tree-row-h": string;
  "--tree-row-py": string;
  "--tree-indent": string;
} {
  const found = LIBRARY_DENSITIES.find((d) => d.id === density) ?? LIBRARY_DENSITIES[1];
  return {
    "--tree-row-h": `${found.row}px`,
    "--tree-row-py": `${found.pad}px`,
    "--tree-indent": `${found.indent}px`,
  };
}

/** Narrow an unknown string — a stored preference, mostly — back to a layout. */
export function asLayout(value: string | null | undefined): LibraryLayout {
  return LIBRARY_LAYOUTS.some((l) => l.id === value) ? (value as LibraryLayout) : DEFAULT_LIBRARY_LAYOUT;
}

/** Narrow an unknown string back to a density. */
export function asDensity(value: string | null | undefined): LibraryDensity {
  return LIBRARY_DENSITIES.some((d) => d.id === value) ? (value as LibraryDensity) : DEFAULT_LIBRARY_DENSITY;
}
