import type { Folder, Issue, LibraryFile, Member, Run, Workflow } from "./types";
import type { AuditEntry, Runner } from "@conduit/domain";
import type { Credential, EventTrigger, GlobalValue, Package, Schedule } from "./manage";
import type { License, PlatformUser, Policy, RoleDef } from "./admin";

import type { CurrentUser } from "./user";
import { workflows as sampleWorkflows, folders as sampleFolders, runs as sampleRuns } from "./workflows";
import { files as sampleFiles } from "./files";
import { issues as sampleIssues, members as sampleMembers } from "./issues";
import { auditEntries as sampleAudit } from "./audit";
import { runners as sampleRunners } from "./runners";
import {
  credentials as sampleCredentials,
  eventTriggers as sampleEventTriggers,
  globalValues as sampleGlobalValues,
  packages as samplePackages,
  schedules as sampleSchedules,
} from "./manage";
import { licenses as sampleLicenses, platformUsers as samplePlatformUsers, policies, roleDefs } from "./admin";

/* =============================================================================
   What the app boots with
   -----------------------------------------------------------------------------
   Conduit ships **empty**. A fresh install has no estate, no runner pool and no
   history, because none of those exist until someone connects a platform, starts
   a runner, or authors something. That is the state this file's `CLEAN` dataset
   describes, and it is the default.

   `SAMPLE` is the demo estate — the seed modules, unchanged — behind the "Sample
   data" switch in Settings. It exists so the prototype can still be shown to
   someone without them first having to build an estate to look at.

   Two things this file is careful about:

   1. **Empty is not the same as zero.** A freshly set-up platform still has the
      two visibility roots (the library needs somewhere to put the first thing you
      author), the four tier definitions, and the policy catalogue — those are the
      product, not somebody's data. It also has exactly one account: yours, taken
      from the address you signed in with rather than from a fixture.
   2. **The seed modules are untouched.** They stay exactly as they were and are
      still what the tests read, so "what the app boots with" is a decision made
      here rather than a property smeared across fifteen data files.
   ============================================================================= */

/** Every collection the app's state is seeded from. */
export type Dataset = {
  workflows: Workflow[];
  folders: Folder[];
  files: LibraryFile[];
  runs: Run[];
  issues: Issue[];
  members: Member[];
  audit: AuditEntry[];
  runners: Runner[];
  schedules: Schedule[];
  eventTriggers: EventTrigger[];
  credentials: Credential[];
  packages: Package[];
  globalValues: GlobalValue[];
  platformUsers: PlatformUser[];
  licenses: License[];
  /** The tier definitions. Product constants — identical in both datasets. */
  roleDefs: RoleDef[];
  /** The policy catalogue. Product constants — identical in both datasets. */
  policies: Policy[];
};

/* --------------------------------------------------------------- clean install */

/**
 * The two visibility roots, and nothing else.
 *
 * The library is a tree under Public and Private, so a brand-new install needs
 * these two before it needs anything: `newWorkflow` has to file the first
 * workflow somewhere, and a tree with no folder at all offers nowhere to create
 * one. Everything below them is authored, not shipped.
 */
const ROOT_FOLDERS: Folder[] = [
  { id: "pub-root", name: "Shared", parentId: null, visibility: "public" },
  { id: "prv-root", name: "My workflows", parentId: null, visibility: "private" },
];

/** The id the signed-in user holds in `members` and (as `pu_me`) in
 *  `platformUsers`, so an avatar, an assignee and an admin row all resolve to the
 *  same person. The store re-derives both rows whenever the profile is edited. */
export const ME_ID = "me";
export const ME_PLATFORM_USER_ID = "pu_me";

/** The signed-in user as a team member. */
export function meAsMember(user: CurrentUser): Member {
  return { id: ME_ID, name: user.name, initials: user.initials, accent: "indigo" };
}

/** The signed-in user as the one platform account a fresh install has. */
export function meAsPlatformUser(user: CurrentUser): PlatformUser {
  return {
    id: ME_PLATFORM_USER_ID,
    memberId: ME_ID,
    email: user.email,
    role: user.role,
    status: "Active",
    lastActive: "just now",
  };
}

/** A fresh install: the structure the product defines, and none of anyone's data —
 *  except you, because a workspace with no account in it isn't one you're in. */
export function cleanDataset(user: CurrentUser): Dataset {
  return {
    workflows: [],
    folders: ROOT_FOLDERS,
    files: [],
    runs: [],
    issues: [],
    members: [meAsMember(user)],
    audit: [],
    runners: [],
    schedules: [],
    eventTriggers: [],
    credentials: [],
    packages: [],
    globalValues: [],
    platformUsers: [meAsPlatformUser(user)],
    licenses: [],
    roleDefs,
    policies,
  };
}

/* ---------------------------------------------------------------- sample estate */

/** The demo estate: the seed modules as they are. */
export const SAMPLE: Dataset = {
  workflows: sampleWorkflows,
  folders: sampleFolders,
  files: sampleFiles,
  runs: sampleRuns,
  issues: sampleIssues,
  members: sampleMembers,
  audit: sampleAudit,
  runners: sampleRunners,
  schedules: sampleSchedules,
  eventTriggers: sampleEventTriggers,
  credentials: sampleCredentials,
  packages: samplePackages,
  globalValues: sampleGlobalValues,
  platformUsers: samplePlatformUsers,
  licenses: sampleLicenses,
  roleDefs,
  policies,
};

/**
 * The dataset the app boots with. `demo` comes from the Settings switch.
 *
 * The sample estate is a fictional team and deliberately does *not* absorb the
 * signed-in user: it is somebody else's workspace, shown to demonstrate the
 * product. Only the clean install has you in it, because there it is your
 * workspace and an empty account list would be a lie.
 */
export function dataset(demo: boolean, user: CurrentUser): Dataset {
  return demo ? SAMPLE : cleanDataset(user);
}
