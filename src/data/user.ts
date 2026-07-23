import type { Role } from "./types";

/** The signed-in user shown in the sidebar account menu. */
export type CurrentUser = { name: string; email: string; initials: string; role: Role };

export const currentUser: CurrentUser = {
  name: "Keith Kennedy",
  email: "k.kennedy@conduit.com",
  initials: "KK",
  /** Drives permission-gated UI (Users/Administration). Admin sees everything. */
  role: "admin",
};
