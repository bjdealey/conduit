import type { ActivityEvent, Automation, Folder, Run } from "./types";

/**
 * Seed data for the automation library — the first-class entity. Automations live
 * in a Public/Private folder tree, produce Runs (executions), and a failed run can
 * spin off an incident (see `issues.ts`; #120 is linked from run `run_1043`). This
 * is in-memory prototype data — edit freely.
 */

/* ----------------------------------------------------------------------- folders */

export const folders: Folder[] = [
  // Public (shared) tree
  { id: "pub-root", name: "Shared", parentId: null, visibility: "public" },
  { id: "pub-billing", name: "Billing", parentId: "pub-root", visibility: "public" },
  { id: "pub-onboarding", name: "Onboarding", parentId: "pub-root", visibility: "public" },
  { id: "pub-monitoring", name: "Monitoring", parentId: "pub-root", visibility: "public" },
  { id: "pub-monitoring-synth", name: "Synthetics", parentId: "pub-monitoring", visibility: "public" },
  // Private (owner-scoped) tree
  { id: "prv-root", name: "My automations", parentId: null, visibility: "private" },
  { id: "prv-drafts", name: "Drafts", parentId: "prv-root", visibility: "private" },
];

/* --------------------------------------------------------------------- run logs */

const runLog = (
  sid: string,
  outcome: "ok" | "fail",
  extra?: ActivityEvent[],
): ActivityEvent[] => {
  const base: ActivityEvent[] = [
    { id: `${sid}-1`, kind: "status", time: "just now", title: "Run started" },
    { id: `${sid}-2`, kind: "fact", time: "just now", title: "Resolved 3 credentials, loaded 2 packages" },
    { id: `${sid}-3`, kind: "fact", time: "just now", title: "Processed 128 records" },
  ];
  if (outcome === "ok") {
    base.push({ id: `${sid}-4`, kind: "status", time: "just now", title: "Run completed successfully" });
  } else {
    base.push({
      id: `${sid}-4`,
      kind: "problem",
      time: "just now",
      title: "Run failed",
      body: "Step 4 threw an unhandled error; the run was aborted.",
    });
  }
  return extra ? [...base, ...extra] : base;
};

/* -------------------------------------------------------------------------- runs */

export const runs: Run[] = [
  {
    id: "run_1043",
    automationId: "aut_reset_audit",
    state: "Failed",
    trigger: "Schedule",
    startedBy: "Schedule · every 15m",
    startedAt: "36 minutes ago",
    duration: "48 s",
    target: "prod-runner-2",
    issueId: 120,
    activity: runLog("run_1043", "fail", [
      {
        id: "run_1043-5",
        kind: "problem",
        time: "just now",
        title: "Incident opened",
        body: "A surge in failed password resets was raised as incident #120.",
      },
    ]),
  },
  {
    id: "run_1042",
    automationId: "aut_reset_audit",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 15m",
    startedAt: "51 minutes ago",
    duration: "44 s",
    target: "prod-runner-2",
    activity: runLog("run_1042", "ok"),
  },
  {
    id: "run_1030",
    automationId: "aut_invoice_export",
    state: "Running",
    trigger: "Manual",
    startedBy: "Priya Fenn",
    startedAt: "2 minutes ago",
    duration: "2 min 10 s",
    target: "prod-runner-1",
    activity: [
      { id: "run_1030-1", kind: "status", time: "2 min ago", title: "Run started" },
      { id: "run_1030-2", kind: "fact", time: "1 min ago", title: "Exporting invoices for 4,200 accounts" },
    ],
  },
  {
    id: "run_1027",
    automationId: "aut_welcome_email",
    state: "Completed",
    trigger: "Event",
    startedBy: "Event · user.signup",
    startedAt: "6 minutes ago",
    duration: "3 s",
    activity: runLog("run_1027", "ok"),
  },
  {
    id: "run_1019",
    automationId: "aut_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "4 minutes ago",
    duration: "11 s",
    target: "eu-runner-1",
    activity: runLog("run_1019", "ok"),
  },
  {
    id: "run_1005",
    automationId: "aut_payment_recon",
    state: "Queued",
    trigger: "Schedule",
    startedBy: "Schedule · hourly",
    startedAt: "queued",
    duration: "—",
    activity: [{ id: "run_1005-1", kind: "status", time: "just now", title: "Queued, waiting for a runner" }],
  },
];

/* ------------------------------------------------------------------- automations */

export const automations: Automation[] = [
  {
    id: "aut_reset_audit",
    name: "Password reset link audit",
    description:
      "Exercises the production password-reset flow end to end and verifies the generated link resolves.",
    folderId: "pub-monitoring-synth",
    visibility: "public",
    status: "Active",
    ownerId: "ls",
    runCount: 1043,
    successRate: 0.982,
    lastRunAt: "36 minutes ago",
    updatedAgo: "2 days ago",
    packages: ["http", "browser", "assertions"],
    references: ["aut_synthetic_login"],
  },
  {
    id: "aut_invoice_export",
    name: "Bulk invoice export",
    description: "Generates and archives monthly invoice exports for accounts with long billing history.",
    folderId: "pub-billing",
    visibility: "public",
    status: "Active",
    ownerId: "pf",
    runCount: 512,
    successRate: 0.94,
    lastRunAt: "2 minutes ago",
    updatedAgo: "5 days ago",
    packages: ["pdf", "storage-s3", "billing-api"],
    references: [],
  },
  {
    id: "aut_welcome_email",
    name: "Welcome email dispatch",
    description: "Sends welcome and verification emails when a new user signs up.",
    folderId: "pub-onboarding",
    visibility: "public",
    status: "Active",
    ownerId: "ps",
    runCount: 8874,
    successRate: 0.997,
    lastRunAt: "6 minutes ago",
    updatedAgo: "yesterday",
    packages: ["email-ses", "templates"],
    references: [],
  },
  {
    id: "aut_synthetic_login",
    name: "Synthetic login check",
    description: "Logs into the app from EU and US probes every five minutes and records latency.",
    folderId: "pub-monitoring-synth",
    visibility: "public",
    status: "Active",
    ownerId: "jk",
    runCount: 20431,
    successRate: 0.999,
    lastRunAt: "4 minutes ago",
    updatedAgo: "3 hours ago",
    packages: ["browser", "metrics"],
    references: [],
  },
  {
    id: "aut_payment_recon",
    name: "Payment reconciliation",
    description: "Reconciles authorised payments against the ledger and flags declines by region.",
    folderId: "pub-billing",
    visibility: "public",
    status: "Active",
    ownerId: "jk",
    runCount: 733,
    successRate: 0.9,
    lastRunAt: "an hour ago",
    updatedAgo: "6 days ago",
    packages: ["billing-api", "ledger", "assertions"],
    references: ["aut_invoice_export"],
  },
  {
    id: "aut_index_rebuild",
    name: "Search index rebuild",
    description: "Rebuilds the product search index and validates relevance against a golden set.",
    folderId: "prv-drafts",
    visibility: "private",
    status: "Draft",
    ownerId: "pf",
    runCount: 4,
    successRate: 0.5,
    lastRunAt: "3 hours ago",
    updatedAgo: "3 hours ago",
    packages: ["search", "assertions"],
    references: [],
  },
];
