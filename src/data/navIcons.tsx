import type { ReactNode } from "react";
import { Bell, Cpu, House, ScaleIcon, Settings, Workflow as WorkflowIcon } from "lucide-react";
import type { View } from "../store";

/* =============================================================================
   Navigation icons
   -----------------------------------------------------------------------------
   One glyph per destination, keyed by view so neither navigation surface can
   miss one. Lifted out of the sidebar when the bottom bar arrived: the same
   destination must carry the same glyph on the rail and on the bar, or the two
   shells read as two products.

   Keyed by `View`, not `Section`: subpages have no icons. The rail indents them
   under their parent's glyph and the bottom sheet does the same, because a
   second icon vocabulary one level down gives the eye two things to learn where
   the indent already says everything.

   `size` is a parameter rather than a constant because the two surfaces are read
   at different distances — the rail's 20px icon sits beside a label at arm's
   length, the bar's is the tap target itself.
   ============================================================================= */

/** Every destination's glyph at `size`. Includes the modes that aren't nav
 *  destinations (the builder, Settings' full-screen rail) so the record is
 *  total over `View` and a new one can't be forgotten. */
export function navIcons(size: number): Record<View, ReactNode> {
  const props = { size, strokeWidth: 1.7 } as const;
  return {
    home: <House {...props} />,
    workflows: <WorkflowIcon {...props} />,
    activity: <Bell {...props} />,
    runners: <Cpu {...props} />,
    // Scales rather than a shield: this destination is where work is weighed —
    // approved, recorded, governed — not where the platform is defended.
    governance: <ScaleIcon {...props} />,
    settings: <Settings {...props} />,
    builder: <WorkflowIcon {...props} />,
  };
}
