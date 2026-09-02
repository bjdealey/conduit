import type { Section } from "./nav";

/* =============================================================================
   Surface readiness
   -----------------------------------------------------------------------------
   The vision is explicit about what the prototype does *not* prove — scheduling,
   credentials, notifications, multi-user auth are all named as roadmap. The app
   renders complete-looking screens for every one of them, so a stakeholder
   clicking through reasonably assumes they work.

   Being explicit about the boundary is described in the vision as a feature of
   the pitch rather than a weakness. This is the app embodying that instead of
   quietly undercutting it: every surface says which of the three it is, and the
   marker is derived from one table so it can't drift per screen.

   Named `SurfaceReadiness` because `Readiness` is already taken by the workload
   bands in `@conduit/domain` — that one asks whether a *workflow* could run on
   lightweight compute, this one asks whether a *screen* is real yet.
   ============================================================================= */

/**
 * How much of a surface is real.
 *
 * - `live` — backed by our API, showing data from a connected system.
 * - `prototype` — the interaction is real and complete, running on seed data.
 * - `roadmap` — the shape is drawn, but nothing behind it is built. Named in the
 *   vision's "what this deliberately does not prove" list.
 */
export const SURFACE_READINESS = ["live", "prototype", "roadmap"] as const;
export type SurfaceReadiness = (typeof SURFACE_READINESS)[number];

/** Chip label and colour per level, on the reserved status palette. */
export const READINESS_META: Readonly<Record<SurfaceReadiness, { label: string; tone: string; blurb: string }>> =
  Object.freeze({
    live: { label: "Live", tone: "grass", blurb: "Reading from a connected system through our API." },
    prototype: {
      label: "Prototype",
      tone: "blue",
      blurb: "The interaction is complete and runs on seed data. No backend behind it yet.",
    },
    roadmap: {
      label: "Roadmap",
      tone: "gray",
      blurb: "The shape is drawn; nothing behind it is built. On the roadmap, not in the prototype.",
    },
  });

/**
 * Per-section readiness.
 *
 * `roadmap` is used exactly where the vision says the prototype doesn't reach:
 * scheduling and credentials (Workflows' Triggers, Settings' Resources), and
 * multi-user auth and governance (Governance's Administration).
 *
 * Keyed by `Section`, not `View`, because a destination is no longer one screen:
 * Governance's Review queue drives end to end while its Administration tab is
 * shape-only, and one marker for both would be a lie about one of them.
 */
const BASE: Readonly<Record<Section, SurfaceReadiness>> = Object.freeze({
  home: "prototype",
  "workflows/library": "prototype",
  "workflows/triggers": "roadmap",
  "activity/runs": "prototype",
  "activity/issues": "prototype",
  runners: "prototype",
  "governance/review": "prototype",
  "governance/audit": "prototype",
  "governance/administration": "roadmap",
  settings: "prototype",
  builder: "prototype",
});

/**
 * The readiness of a section, given where its data is coming from.
 *
 * The workflow surfaces are the only ones that can currently be `live`, because
 * they're the only ones wired to our API — so a configured backend upgrades them
 * and leaves the rest honest.
 */
export function readinessOf(section: Section, dataSource: "live" | "seed"): SurfaceReadiness {
  const base = BASE[section];
  const readsOurApi = section === "workflows/library" || section === "home";
  return dataSource === "live" && readsOurApi && base === "prototype" ? "live" : base;
}
