import type { ReactNode } from "react";
import {
  Bell,
  Box,
  ClipboardCheck,
  Cpu,
  House,
  Inbox,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow as WorkflowIcon,
} from "lucide-react";
import type { View } from "../store";

/* =============================================================================
   Navigation icons
   -----------------------------------------------------------------------------
   One glyph per destination, keyed by view so neither navigation surface can
   miss one. Lifted out of the sidebar when the bottom bar arrived: the same
   destination must carry the same glyph on the rail and on the bar, or the two
   shells read as two products.

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
    audit: <ScrollText {...props} />,
    review: <ClipboardCheck {...props} />,
    home: <House {...props} />,
    builder: <WorkflowIcon {...props} />,
    activity: <Bell {...props} />,
    inbox: <Inbox {...props} />,
    workflows: <WorkflowIcon {...props} />,
    manage: <SlidersHorizontal {...props} />,
    users: <Users {...props} />,
    administration: <ShieldCheck {...props} />,
    surfaces: <Box {...props} />,
    runners: <Cpu {...props} />,
    settings: <Settings {...props} />,
  };
}
