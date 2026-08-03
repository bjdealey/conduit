/**
 * Operational objects for the Manage section: how workflows are executed
 * (Scheduled, Event triggers) and the config runs consume (Credentials, Packages,
 * Global values). References into `workflows.ts` are by workflow id, and the
 * cadences/events line up with the run seed data (e.g. wf_reset_audit every 15m).
 * In-memory prototype data — edit freely.
 */

/* ------------------------------------------------------------------- schedules */

/**
 * A cadence that starts an workflow.
 *
 * A schedule says *when*, never *where*. There is deliberately no target field: the
 * distributor places each run on a runner that fits the workflow's requirements at
 * the moment it fires. Pinning work to a named machine here is the habit the platform
 * exists to remove.
 */
export type Schedule = {
  id: string;
  workflowId: string;
  /** Human cadence, e.g. "Every 15 minutes". */
  cadence: string;
  nextRun: string;
  lastRun: string;
  enabled: boolean;
};

export const schedules: Schedule[] = [
  { id: "sch_01", workflowId: "wf_synthetic_login", cadence: "Every 5 minutes", nextRun: "in 2 min", lastRun: "4 minutes ago", enabled: true },
  { id: "sch_02", workflowId: "wf_reset_audit", cadence: "Every 15 minutes", nextRun: "in 9 min", lastRun: "36 minutes ago", enabled: true },
  { id: "sch_03", workflowId: "wf_payment_recon", cadence: "Hourly", nextRun: "in 24 min", lastRun: "an hour ago", enabled: true },
  { id: "sch_04", workflowId: "wf_invoice_export", cadence: "Daily at 02:00 UTC", nextRun: "in 6 h", lastRun: "yesterday", enabled: false },
];

/* -------------------------------------------------------------- event triggers */

export type EventTrigger = {
  id: string;
  workflowId: string;
  /** Event key that fires the workflow, e.g. "user.signup". */
  event: string;
  /** Optional filter expression. */
  condition: string;
  lastFired: string;
  fireCount: number;
  enabled: boolean;
};

export const eventTriggers: EventTrigger[] = [
  { id: "evt_01", workflowId: "wf_welcome_email", event: "user.signup", condition: "always", lastFired: "6 minutes ago", fireCount: 8874, enabled: true },
  { id: "evt_02", workflowId: "wf_reset_audit", event: "deploy.completed", condition: "surface = auth", lastFired: "38 minutes ago", fireCount: 412, enabled: true },
  { id: "evt_03", workflowId: "wf_payment_recon", event: "payment.failed", condition: "region = BR", lastFired: "40 minutes ago", fireCount: 96, enabled: true },
  { id: "evt_04", workflowId: "wf_index_rebuild", event: "catalog.updated", condition: "items > 500", lastFired: "3 hours ago", fireCount: 4, enabled: false },
];

/* ----------------------------------------------------------------- credentials */

export type Credential = {
  id: string;
  name: string;
  kind: "API key" | "OAuth" | "Basic auth" | "Token";
  scope: string;
  lastUsed: string;
  /** Owning team member id (see `members`). */
  ownerId: string;
};

export const credentials: Credential[] = [
  { id: "cred_ses", name: "AWS SES (email)", kind: "API key", scope: "email-ses", lastUsed: "6 minutes ago", ownerId: "ps" },
  { id: "cred_s3", name: "S3 archive bucket", kind: "Token", scope: "storage-s3", lastUsed: "2 minutes ago", ownerId: "pf" },
  { id: "cred_billing", name: "Billing API", kind: "API key", scope: "billing-api", lastUsed: "an hour ago", ownerId: "jk" },
  { id: "cred_github", name: "GitHub app", kind: "OAuth", scope: "repo, checks", lastUsed: "38 minutes ago", ownerId: "ls" },
  { id: "cred_ledger", name: "Ledger service", kind: "Basic auth", scope: "ledger", lastUsed: "an hour ago", ownerId: "jk" },
];

/* -------------------------------------------------------------------- packages */

export type Package = {
  id: string;
  name: string;
  version: string;
  publisher: string;
  /** Number of workflows depending on this package. */
  usedBy: number;
  updatedAgo: string;
};

export const packages: Package[] = [
  { id: "pkg_browser", name: "browser", version: "3.4.1", publisher: "conduit", usedBy: 2, updatedAgo: "5 days ago" },
  { id: "pkg_http", name: "http", version: "2.1.0", publisher: "conduit", usedBy: 1, updatedAgo: "2 weeks ago" },
  { id: "pkg_assertions", name: "assertions", version: "1.8.2", publisher: "conduit", usedBy: 3, updatedAgo: "9 days ago" },
  { id: "pkg_email_ses", name: "email-ses", version: "4.0.0", publisher: "aws", usedBy: 1, updatedAgo: "yesterday" },
  { id: "pkg_billing", name: "billing-api", version: "6.2.7", publisher: "internal", usedBy: 2, updatedAgo: "3 days ago" },
  { id: "pkg_pdf", name: "pdf", version: "0.9.5", publisher: "community", usedBy: 1, updatedAgo: "a month ago" },
];

/* ---------------------------------------------------------------- global values */

export type GlobalValue = {
  id: string;
  key: string;
  value: string;
  /** Secret values are masked in the table. */
  secret: boolean;
  updatedAgo: string;
};

export const globalValues: GlobalValue[] = [
  { id: "gv_base_url", key: "BASE_URL", value: "https://app.conduit.com", secret: false, updatedAgo: "2 days ago" },
  { id: "gv_ttl", key: "RESET_TOKEN_TTL", value: "3600", secret: false, updatedAgo: "38 minutes ago" },
  { id: "gv_retries", key: "MAX_RETRIES", value: "3", secret: false, updatedAgo: "a week ago" },
  { id: "gv_region", key: "DEFAULT_REGION", value: "us-east-1", secret: false, updatedAgo: "a month ago" },
  { id: "gv_slack", key: "ALERT_WEBHOOK", value: "https://hooks.slack.com/…", secret: true, updatedAgo: "5 days ago" },
];
