import type { ActivityEvent, Workflow, WorkflowTrigger, Folder, MigrationState, Run } from "./types";
import type { WorkflowRequirements } from "@conduit/domain";

/**
 * Seed data for the workflow library — the first-class entity. Workflows live
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
  // The estate mirrored from the incumbent Control Room. It sits in the same tree as
  // native work on purpose — one library, two platforms, nothing to switch between.
  { id: "pub-aa", name: "Automation Anywhere", parentId: "pub-root", visibility: "public" },
  // Private (owner-scoped) tree
  { id: "prv-root", name: "My workflows", parentId: null, visibility: "private" },
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

/**
 * Recent executions, grouped by workflow and newest first within each group —
 * so `runsForWorkflow` reads newest → oldest. Cross-workflow surfaces
 * (Activity) order by recency themselves.
 *
 * Times are the relative labels the UI renders; the Activity timeline reads them
 * back with `minutesAgo`/`durationSeconds` (`src/lib/format.ts`), so keep them in
 * that vocabulary ("14 minutes ago", "2 hours ago", "2 min 10 s") — and keep two
 * runs of the same workflow on distinct labels, or they land on the same spot
 * of the time axis.
 */
export const runs: Run[] = [
  {
    id: "run_1045",
    workflowId: "wf_reset_audit",
    state: "Running",
    trigger: "Manual",
    startedBy: "Luke Shiels",
    startedAt: "1 minute ago",
    duration: "40 s",
    runnerId: "rnr_lw_01",
    activity: [
      { id: "run_1045-1", kind: "status", time: "1 min ago", title: "Run started" },
      {
        id: "run_1045-2",
        kind: "fact",
        time: "1 min ago",
        title: "Re-run requested from incident #120",
        memberId: "ls",
      },
      { id: "run_1045-3", kind: "fact", time: "just now", title: "Resolved 3 credentials, loaded 2 packages" },
    ],
  },
  {
    id: "run_1043",
    workflowId: "wf_reset_audit",
    state: "Failed",
    trigger: "Schedule",
    startedBy: "Schedule · every 15m",
    startedAt: "36 minutes ago",
    duration: "48 s",
    runnerId: "rnr_lw_01",
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
    workflowId: "wf_reset_audit",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 15m",
    startedAt: "51 minutes ago",
    duration: "44 s",
    runnerId: "rnr_lw_01",
    activity: runLog("run_1042", "ok"),
  },
  {
    id: "run_1044",
    workflowId: "wf_reset_audit",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 15m",
    startedAt: "21 minutes ago",
    duration: "45 s",
    runnerId: "rnr_lw_01",
    activity: runLog("run_1044", "ok"),
  },
  {
    id: "run_1041",
    workflowId: "wf_reset_audit",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 15m",
    startedAt: "66 minutes ago",
    duration: "47 s",
    runnerId: "rnr_lw_01",
    activity: runLog("run_1041", "ok"),
  },
  {
    id: "run_1030",
    workflowId: "wf_invoice_export",
    state: "Running",
    trigger: "Manual",
    startedBy: "Priya Fenn",
    startedAt: "2 minutes ago",
    duration: "2 min 10 s",
    runnerId: "rnr_lw_02",
    activity: [
      { id: "run_1030-1", kind: "status", time: "2 min ago", title: "Run started" },
      { id: "run_1030-2", kind: "fact", time: "1 min ago", title: "Exporting invoices for 4,200 accounts" },
    ],
  },
  {
    id: "run_1029",
    workflowId: "wf_invoice_export",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · nightly",
    startedAt: "3 hours ago",
    duration: "6 min 40 s",
    runnerId: "rnr_lw_02",
    activity: runLog("run_1029", "ok"),
  },
  {
    id: "run_1028",
    workflowId: "wf_invoice_export",
    state: "Failed",
    trigger: "Schedule",
    startedBy: "Schedule · nightly",
    startedAt: "4 hours ago",
    duration: "1 min 12 s",
    runnerId: "rnr_lw_02",
    activity: runLog("run_1028", "fail"),
  },
  {
    id: "run_1027",
    workflowId: "wf_welcome_email",
    state: "Completed",
    trigger: "Event",
    startedBy: "Event · user.signup",
    startedAt: "6 minutes ago",
    duration: "3 s",
    activity: runLog("run_1027", "ok"),
  },
  {
    id: "run_1026",
    workflowId: "wf_welcome_email",
    state: "Completed",
    trigger: "Event",
    startedBy: "Event · user.signup",
    startedAt: "12 minutes ago",
    duration: "3 s",
    activity: runLog("run_1026", "ok"),
  },
  {
    id: "run_1025",
    workflowId: "wf_welcome_email",
    state: "Completed",
    trigger: "Event",
    startedBy: "Event · user.signup",
    startedAt: "27 minutes ago",
    duration: "4 s",
    activity: runLog("run_1025", "ok"),
  },
  {
    id: "run_1024",
    workflowId: "wf_welcome_email",
    state: "Completed",
    trigger: "Event",
    startedBy: "Event · user.signup",
    startedAt: "58 minutes ago",
    duration: "3 s",
    activity: runLog("run_1024", "ok"),
  },
  {
    id: "run_1019",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "4 minutes ago",
    duration: "11 s",
    runnerId: "rnr_lw_03",
    activity: runLog("run_1019", "ok"),
  },
  {
    id: "run_1018",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "9 minutes ago",
    duration: "12 s",
    runnerId: "rnr_lw_04",
    activity: runLog("run_1018", "ok"),
  },
  {
    id: "run_1017",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "14 minutes ago",
    duration: "10 s",
    runnerId: "rnr_lw_03",
    activity: runLog("run_1017", "ok"),
  },
  {
    id: "run_1016",
    workflowId: "wf_synthetic_login",
    state: "Failed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "19 minutes ago",
    duration: "31 s",
    runnerId: "rnr_lw_04",
    activity: runLog("run_1016", "fail"),
  },
  {
    id: "run_1015",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "24 minutes ago",
    duration: "11 s",
    runnerId: "rnr_lw_03",
    activity: runLog("run_1015", "ok"),
  },
  {
    id: "run_1014",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "44 minutes ago",
    duration: "12 s",
    runnerId: "rnr_lw_04",
    activity: runLog("run_1014", "ok"),
  },
  {
    id: "run_1013",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "74 minutes ago",
    duration: "11 s",
    runnerId: "rnr_lw_03",
    activity: runLog("run_1013", "ok"),
  },
  {
    id: "run_1012",
    workflowId: "wf_synthetic_login",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · every 5m",
    startedAt: "2 hours ago",
    duration: "13 s",
    runnerId: "rnr_lw_04",
    activity: runLog("run_1012", "ok"),
  },
  {
    id: "run_1005",
    workflowId: "wf_payment_recon",
    state: "Queued",
    trigger: "Schedule",
    startedBy: "Schedule · hourly",
    startedAt: "queued",
    duration: "—",
    activity: [{ id: "run_1005-1", kind: "status", time: "just now", title: "Queued, waiting for a runner" }],
  },
  {
    id: "run_1004",
    workflowId: "wf_payment_recon",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · hourly",
    startedAt: "63 minutes ago",
    duration: "3 min 20 s",
    runnerId: "rnr_wsa_01",
    activity: runLog("run_1004", "ok"),
  },
  {
    id: "run_1003",
    workflowId: "wf_payment_recon",
    state: "Completed",
    trigger: "Schedule",
    startedBy: "Schedule · hourly",
    startedAt: "2 hours ago",
    duration: "3 min 5 s",
    runnerId: "rnr_wsa_01",
    activity: runLog("run_1003", "ok"),
  },
  {
    id: "run_1002",
    workflowId: "wf_index_rebuild",
    state: "Failed",
    trigger: "Manual",
    startedBy: "Priya Fenn",
    startedAt: "3 hours ago",
    duration: "2 min 30 s",
    activity: runLog("run_1002", "fail"),
  },
];

/* ------------------------------------------------------------------- workflows */

/**
 * An workflow mirrored from a connected platform by its connector.
 *
 * We show it, observe its runs, and track where it sits in the move onto Conduit —
 * but its flow is authored on its own platform, so `steps` and `packages` are empty
 * rather than invented. That emptiness is the honest signal that this row is a
 * reflection of somewhere else, and it's what the builder checks before offering to
 * edit anything.
 */
function mirrored(
  id: string,
  name: string,
  description: string,
  ownerId: string,
  requirements: WorkflowRequirements,
  migration: MigrationState,
  stats: { runCount: number; successRate: number; lastRunAt: string; trigger: WorkflowTrigger },
): Workflow {
  return {
    id,
    name,
    description,
    folderId: "pub-aa",
    visibility: "public",
    status: "Published",
    ownerId,
    platform: "automation-anywhere",
    migration,
    requirements,
    trigger: stats.trigger,
    steps: [],
    runCount: stats.runCount,
    successRate: stats.successRate,
    lastRunAt: stats.lastRunAt,
    updatedAgo: "—",
    packages: [],
    references: [],
  };
}

const schedule = (detail: string): WorkflowTrigger => ({ kind: "Schedule", detail });
const headed: WorkflowRequirements = { auth: "none", ui: "headed", platform: "windows" };
const windowsAuth: WorkflowRequirements = { auth: "windows-integrated", ui: "none", platform: "windows" };
const apiFirst = (auth: WorkflowRequirements["auth"]): WorkflowRequirements => ({ auth, ui: "none", platform: "any" });

export const workflows: Workflow[] = [
  {
    id: "wf_reset_audit",
    name: "Password reset link audit",
    description:
      "Exercises the production password-reset flow end to end and verifies the generated link resolves.",
    folderId: "pub-monitoring-synth",
    visibility: "public",
    status: "Published",
    ownerId: "ls",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "oauth-client-credentials", ui: "none", platform: "any" },
    trigger: { kind: "Schedule", detail: "Every 15 minutes" },
    steps: [
      { id: "stp_ra_1", actionId: "browser.open", config: { engine: "Chromium", mode: "Headless" } },
      { id: "stp_ra_2", actionId: "browser.goto", config: { url: "https://app.conduit.com/forgot-password", timeout: "30" } },
      { id: "stp_ra_3", actionId: "browser.fill", config: { selector: "#email", value: "{{ probe.email }}" } },
      { id: "stp_ra_4", actionId: "browser.click", config: { selector: "button[type=submit]" } },
      { id: "stp_ra_5", actionId: "http.request", config: { method: "GET", url: "https://api.conduit.com/v1/mailbox/latest", body: "" } },
      { id: "stp_ra_6", actionId: "assert.resolves", config: { url: "{{ email.resetLink }}", within: "10" } },
    ],
    runCount: 1045,
    successRate: 0.982,
    lastRunAt: "1 minute ago",
    updatedAgo: "2 days ago",
    packages: ["browser", "http", "assertions"],
    references: ["wf_synthetic_login"],
  },
  {
    id: "wf_invoice_export",
    name: "Bulk invoice export",
    description: "Generates and archives monthly invoice exports for accounts with long billing history.",
    folderId: "pub-billing",
    visibility: "public",
    status: "Published",
    ownerId: "pf",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "managed-identity", ui: "none", platform: "any" },
    trigger: { kind: "Schedule", detail: "Daily at 02:00 UTC" },
    steps: [
      { id: "stp_ie_1", actionId: "records.query", config: { source: "invoices", filter: "status = 'open'", limit: "500" } },
      { id: "stp_ie_2", actionId: "pdf.render", config: { template: "invoice-v3", output: "{{ invoice.id }}.pdf" } },
      { id: "stp_ie_3", actionId: "storage.put", config: { bucket: "conduit-archive", path: "invoices/{{ date }}/" } },
    ],
    runCount: 512,
    successRate: 0.94,
    lastRunAt: "2 minutes ago",
    updatedAgo: "5 days ago",
    packages: ["billing-api", "pdf", "storage-s3"],
    references: [],
  },
  {
    id: "wf_welcome_email",
    name: "Welcome email dispatch",
    description: "Sends welcome and verification emails when a new user signs up.",
    folderId: "pub-onboarding",
    visibility: "public",
    status: "Published",
    ownerId: "ps",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "api-key", ui: "none", platform: "any" },
    trigger: { kind: "Event", detail: "user.signup" },
    steps: [
      { id: "stp_we_1", actionId: "templates.render", config: { template: "verification-email", data: "user, token" } },
      { id: "stp_we_2", actionId: "email.send", config: { to: "{{ user.email }}", template: "welcome-v2", subject: "Welcome to Conduit" } },
    ],
    runCount: 8874,
    successRate: 0.997,
    lastRunAt: "6 minutes ago",
    updatedAgo: "yesterday",
    packages: ["templates", "email-ses"],
    references: [],
  },
  {
    id: "wf_synthetic_login",
    name: "Synthetic login check",
    description: "Logs into the app from EU and US probes every five minutes and records latency.",
    folderId: "pub-monitoring-synth",
    visibility: "public",
    status: "Published",
    ownerId: "jk",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "none", ui: "none", platform: "any" },
    trigger: { kind: "Schedule", detail: "Every 5 minutes" },
    steps: [
      { id: "stp_sl_1", actionId: "browser.open", config: { engine: "Chromium", mode: "Headless" } },
      { id: "stp_sl_2", actionId: "browser.goto", config: { url: "https://app.conduit.com/login", timeout: "30" } },
      { id: "stp_sl_3", actionId: "browser.fill", config: { selector: "#email", value: "{{ probe.email }}" } },
      { id: "stp_sl_4", actionId: "browser.click", config: { selector: "button[type=submit]" } },
      { id: "stp_sl_5", actionId: "metrics.record", config: { name: "login.latency", value: "{{ timer.elapsed }}" } },
    ],
    runCount: 20431,
    successRate: 0.999,
    lastRunAt: "4 minutes ago",
    updatedAgo: "3 hours ago",
    packages: ["browser", "metrics"],
    references: [],
  },
  {
    id: "wf_payment_recon",
    name: "Payment reconciliation",
    description: "Reconciles authorised payments against the ledger and flags declines by region.",
    folderId: "pub-billing",
    visibility: "public",
    status: "Published",
    ownerId: "jk",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "windows-integrated", ui: "none", platform: "windows" },
    trigger: { kind: "Schedule", detail: "Hourly" },
    steps: [
      { id: "stp_pr_1", actionId: "records.query", config: { source: "payments", filter: "authorised_at > now() - 1h", limit: "500" } },
      { id: "stp_pr_2", actionId: "ledger.reconcile", config: { account: "merchant-eu", onMismatch: "Flag" } },
      { id: "stp_pr_3", actionId: "assert.equals", config: { actual: "{{ recon.unmatched }}", expected: "0" } },
    ],
    runCount: 733,
    successRate: 0.9,
    lastRunAt: "an hour ago",
    updatedAgo: "6 days ago",
    packages: ["billing-api", "ledger", "assertions"],
    references: ["wf_invoice_export"],
  },
  {
    id: "wf_index_rebuild",
    name: "Search index rebuild",
    description: "Rebuilds the product search index and validates relevance against a golden set.",
    folderId: "prv-drafts",
    visibility: "private",
    status: "In review",
    ownerId: "pf",
    submittedBy: "pf",
    submittedAt: "2 hours ago",
    platform: "conduit",
    migration: "Piloting",
    requirements: { auth: "api-key", ui: "none", platform: "any" },
    trigger: { kind: "Manual", detail: "Owner and admins" },
    steps: [
      { id: "stp_ir_1", actionId: "search.reindex", config: { index: "products", swap: "When healthy" } },
      { id: "stp_ir_2", actionId: "assert.equals", config: { actual: "{{ index.relevance }}", expected: "1.0" } },
    ],
    runCount: 4,
    successRate: 0.5,
    lastRunAt: "3 hours ago",
    updatedAgo: "3 hours ago",
    packages: ["search", "assertions"],
    references: [],
  },

  {
    id: "wf_expense_digest",
    name: "Expense digest",
    description: "Pulls the week's card transactions and mails a categorised digest to each budget owner.",
    folderId: "prv-drafts",
    visibility: "private",
    status: "Changes requested",
    ownerId: "ps",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "api-key", ui: "none", platform: "any" },
    submittedBy: "ps",
    submittedAt: "yesterday",
    reviewedBy: "ls",
    reviewedAt: "4 hours ago",
    reviewNote: "Good shape. Narrow the query to the current period and handle the empty-result case before this goes near production.",
    trigger: { kind: "Schedule", detail: "Weekly on Friday" },
    steps: [
      { id: "stp_ed_1", actionId: "records.query", config: { source: "transactions", filter: "posted_at > now() - 7d", limit: "500" } },
      { id: "stp_ed_2", actionId: "templates.render", config: { template: "expense-digest", data: "owner, lines" } },
      { id: "stp_ed_3", actionId: "email.send", config: { to: "{{ owner.email }}", template: "expense-digest", subject: "Your weekly expense digest" } },
    ],
    runCount: 0,
    successRate: 0,
    lastRunAt: "never",
    updatedAgo: "4 hours ago",
    packages: ["billing-api", "templates", "email-ses"],
    references: [],
  },
  {
    id: "wf_supplier_check",
    name: "Supplier detail check",
    description: "Verifies supplier bank details against the finance API before a payment run.",
    folderId: "prv-drafts",
    visibility: "private",
    status: "Approved",
    ownerId: "ps",
    platform: "conduit",
    migration: "Migrated",
    requirements: { auth: "api-key", ui: "none", platform: "any" },
    submittedBy: "ps",
    submittedAt: "3 days ago",
    reviewedBy: "jk",
    reviewedAt: "2 days ago",
    reviewNote: "Hardened the mismatch path and tightened the assertion. Good to publish.",
    trigger: { kind: "Manual", detail: "Owner and admins" },
    steps: [
      { id: "stp_sc_1", actionId: "records.query", config: { source: "suppliers", filter: "status = 'active'", limit: "500" } },
      { id: "stp_sc_2", actionId: "http.request", config: { method: "POST", url: "https://api.conduit.com/v1/verify/bank", body: '{ "id": "{{ supplier.id }}" }' } },
      { id: "stp_sc_3", actionId: "assert.equals", config: { actual: "{{ response.status }}", expected: "200" } },
    ],
    runCount: 0,
    successRate: 0,
    lastRunAt: "never",
    updatedAgo: "2 days ago",
    packages: ["billing-api", "http", "assertions"],
    references: [],
  },

  /* ----------------------------------------------- mirrored from Automation Anywhere
     The incumbent estate, read through the A360 connector. Its shape is the argument:
     mostly headed and Windows-bound today, with a shrinking band of workloads blocked
     only by Windows-integrated auth. Home reads the split straight off these rows
     rather than asserting it. */
  mirrored("wf_aa_vendor_onboarding", "Vendor onboarding", "Keys new vendor records into the finance desktop client and files the approval pack.", "ls", headed, "Not started", { runCount: 3120, successRate: 0.91, lastRunAt: "12 minutes ago", trigger: schedule("Weekdays at 07:00") }),
  mirrored("wf_aa_claims_keying", "Claims keying", "Rekeys scanned claims into the legacy claims terminal. No API path exists.", "jk", headed, "Won't move", { runCount: 18244, successRate: 0.88, lastRunAt: "3 minutes ago", trigger: schedule("Every 10 minutes") }),
  mirrored("wf_aa_statement_pack", "Statement pack assembly", "Drives the reporting client to assemble and print monthly statement packs.", "pf", headed, "Not started", { runCount: 640, successRate: 0.93, lastRunAt: "an hour ago", trigger: schedule("Monthly on the 1st") }),
  mirrored("wf_aa_pricing_upload", "Pricing sheet upload", "Uploads pricing workbooks through the supplier portal UI.", "ps", headed, "Not started", { runCount: 1490, successRate: 0.86, lastRunAt: "26 minutes ago", trigger: schedule("Daily at 06:00") }),
  mirrored("wf_aa_stock_count", "Stock count reconciliation", "Reconciles counted stock against the warehouse desktop system.", "jk", headed, "Won't move", { runCount: 2210, successRate: 0.9, lastRunAt: "2 hours ago", trigger: schedule("Nightly at 23:00") }),
  mirrored("wf_aa_credit_review", "Credit review packet", "Assembles credit review packets from the underwriting client.", "ls", headed, "Not started", { runCount: 880, successRate: 0.94, lastRunAt: "4 hours ago", trigger: schedule("Weekly on Monday") }),
  mirrored("wf_aa_timesheet_post", "Timesheet posting", "Posts approved timesheets through the payroll desktop app.", "ps", headed, "Not started", { runCount: 5030, successRate: 0.96, lastRunAt: "38 minutes ago", trigger: schedule("Daily at 18:00") }),
  // Blocked only by the auth model — these become API-eligible the moment their target
  // app finishes moving to Entra, which is the compounding the vision is betting on.
  mirrored("wf_aa_hr_starter", "HR starter setup", "Creates starter records in the internal HR web app, which still authenticates as the logged-in Windows user.", "pf", windowsAuth, "Piloting", { runCount: 1204, successRate: 0.97, lastRunAt: "18 minutes ago", trigger: schedule("Hourly") }),
  mirrored("wf_aa_asset_register", "Asset register sync", "Syncs the internal asset register, currently behind Windows-integrated auth.", "jk", windowsAuth, "Not started", { runCount: 970, successRate: 0.95, lastRunAt: "an hour ago", trigger: schedule("Every 4 hours") }),
  mirrored("wf_aa_fx_rates", "FX rate refresh", "Pulls daily FX rates from a vendor API. Already API-shaped — ready to move.", "ps", apiFirst("api-key"), "Not started", { runCount: 730, successRate: 0.99, lastRunAt: "5 hours ago", trigger: schedule("Daily at 05:00") }),
];
