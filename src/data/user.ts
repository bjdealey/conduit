/** The signed-in user shown in the sidebar account menu. */
export type CurrentUser = { name: string; email: string; initials: string };

export const currentUser: CurrentUser = {
  name: "Keith Kennedy",
  email: "k.kennedy@conduit.com",
  initials: "KK",
};
