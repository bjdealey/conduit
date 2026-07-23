/** Colour themes: each preset drives both the app's accent (brand) tokens and
 *  the animated Grainient background colours, so choosing one re-themes both. */
export type Palette = {
  id: string;
  name: string;
  /** Radix accent scale used for the app's brand tokens (buttons, focus, etc.). */
  accent: string;
  /** Three Grainient gradient colours. */
  gradient: [string, string, string];
};

export const palettes: Palette[] = [
  { id: "violet", name: "Violet", accent: "violet", gradient: ["#FF9FFC", "#5227FF", "#B497CF"] },
  { id: "ocean", name: "Ocean", accent: "blue", gradient: ["#7DD3FC", "#2563EB", "#93C5FD"] },
  { id: "aqua", name: "Aqua", accent: "cyan", gradient: ["#67E8F9", "#0891B2", "#A5F3E0"] },
  { id: "forest", name: "Forest", accent: "grass", gradient: ["#86EFAC", "#16A34A", "#BBF7D0"] },
  { id: "sunset", name: "Sunset", accent: "amber", gradient: ["#FDE68A", "#F97316", "#FDBA74"] },
  { id: "rose", name: "Rose", accent: "crimson", gradient: ["#FDA4C0", "#E11D74", "#F0A5C8"] },
];
