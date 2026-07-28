/**
 * The action palette the automation builder composes flows from.
 *
 * Each action belongs to a package — the same package names that appear in
 * `Automation.packages` and in Manage → Packages — so a flow's dependencies are
 * derived from its steps rather than typed by hand (see `packagesForSteps`).
 * Fields describe the per-step form the builder renders; they're deliberately
 * shallow (text / number / choice), because this is a prototype of the authoring
 * surface, not an execution engine.
 */

/** One configurable input on an action. */
export type ActionField = {
  id: string;
  label: string;
  /** Which control the builder renders. `choice` uses `options`. */
  kind: "text" | "number" | "choice" | "long";
  /** Options for `choice` fields; the first is the default. */
  options?: string[];
  placeholder?: string;
  /** Prefilled when a step is added (defaults to the first option for `choice`). */
  value?: string;
};

/** One action in the palette. */
export type StepAction = {
  id: string;
  label: string;
  /** Providing package — matches `Automation.packages` and Manage → Packages. */
  package: string;
  /** One line explaining what the step does, shown under the palette entry. */
  summary: string;
  fields: ActionField[];
};

const text = (id: string, label: string, placeholder?: string): ActionField => ({ id, label, kind: "text", placeholder });
const choice = (id: string, label: string, options: string[]): ActionField => ({ id, label, kind: "choice", options });
const number = (id: string, label: string, value: string): ActionField => ({ id, label, kind: "number", value });

/** Every action the builder offers, in palette order. */
export const ACTIONS: StepAction[] = [
  /* ------------------------------------------------------------------ browser */
  {
    id: "browser.open",
    label: "Open browser",
    package: "browser",
    summary: "Start a browser session on a runner.",
    fields: [
      choice("engine", "Engine", ["Chromium", "Firefox", "WebKit"]),
      choice("mode", "Mode", ["Headless", "Headed"]),
    ],
  },
  {
    id: "browser.goto",
    label: "Go to page",
    package: "browser",
    summary: "Navigate the session to a URL.",
    fields: [text("url", "URL", "https://app.conduit.com/…"), number("timeout", "Timeout (s)", "30")],
  },
  {
    id: "browser.fill",
    label: "Fill field",
    package: "browser",
    summary: "Type a value into a form field.",
    fields: [text("selector", "Selector", "#email"), text("value", "Value", "{{ user.email }}")],
  },
  {
    id: "browser.click",
    label: "Click element",
    package: "browser",
    summary: "Click a button or link.",
    fields: [text("selector", "Selector", "button[type=submit]")],
  },

  /* --------------------------------------------------------------------- http */
  {
    id: "http.request",
    label: "HTTP request",
    package: "http",
    summary: "Call an API and capture the response.",
    fields: [
      choice("method", "Method", ["GET", "POST", "PUT", "DELETE"]),
      text("url", "URL", "https://api.conduit.com/v1/…"),
      { id: "body", label: "Body", kind: "long", placeholder: '{ "id": "{{ record.id }}" }' },
    ],
  },

  /* --------------------------------------------------------------- assertions */
  {
    id: "assert.equals",
    label: "Assert equals",
    package: "assertions",
    summary: "Fail the run unless two values match.",
    fields: [text("actual", "Actual", "{{ response.status }}"), text("expected", "Expected", "200")],
  },
  {
    id: "assert.resolves",
    label: "Assert link resolves",
    package: "assertions",
    summary: "Fail the run unless a link returns a success status.",
    fields: [text("url", "Link", "{{ email.resetLink }}"), number("within", "Within (s)", "10")],
  },

  /* ------------------------------------------------------------------- records */
  {
    id: "records.query",
    label: "Query records",
    package: "billing-api",
    summary: "Read a set of records to work through.",
    fields: [text("source", "Source", "invoices"), text("filter", "Filter", "status = 'open'"), number("limit", "Limit", "500")],
  },
  {
    id: "ledger.reconcile",
    label: "Reconcile ledger",
    package: "ledger",
    summary: "Match authorised payments against ledger entries.",
    fields: [text("account", "Account", "merchant-eu"), choice("onMismatch", "On mismatch", ["Flag", "Fail run", "Ignore"])],
  },

  /* -------------------------------------------------------------------- output */
  {
    id: "pdf.render",
    label: "Render PDF",
    package: "pdf",
    summary: "Render a template to a PDF document.",
    fields: [text("template", "Template", "invoice-v3"), text("output", "Output name", "{{ invoice.id }}.pdf")],
  },
  {
    id: "storage.put",
    label: "Store file",
    package: "storage-s3",
    summary: "Write a file to object storage.",
    fields: [text("bucket", "Bucket", "conduit-archive"), text("path", "Path", "invoices/{{ date }}/")],
  },
  {
    id: "email.send",
    label: "Send email",
    package: "email-ses",
    summary: "Send a templated email.",
    fields: [text("to", "To", "{{ user.email }}"), text("template", "Template", "welcome-v2"), text("subject", "Subject", "Welcome to Conduit")],
  },
  {
    id: "templates.render",
    label: "Render template",
    package: "templates",
    summary: "Fill a content template with run data.",
    fields: [text("template", "Template", "verification-email"), { id: "data", label: "Data", kind: "long", placeholder: "user, token" }],
  },

  /* ------------------------------------------------------------------ platform */
  {
    id: "search.reindex",
    label: "Rebuild search index",
    package: "search",
    summary: "Rebuild an index and swap it in when it's ready.",
    fields: [text("index", "Index", "products"), choice("swap", "Swap", ["When healthy", "Immediately"])],
  },
  {
    id: "metrics.record",
    label: "Record metric",
    package: "metrics",
    summary: "Emit a metric point from the run.",
    fields: [text("name", "Metric", "login.latency"), text("value", "Value", "{{ timer.elapsed }}")],
  },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/** Look up a palette action by id. */
export const actionById = (id: string): StepAction | undefined => BY_ID.get(id);

/** Palette actions grouped by package, in declaration order. */
export function actionsByPackage(): { package: string; actions: StepAction[] }[] {
  const groups = new Map<string, StepAction[]>();
  for (const action of ACTIONS) {
    const list = groups.get(action.package) ?? [];
    list.push(action);
    groups.set(action.package, list);
  }
  return [...groups].map(([pkg, actions]) => ({ package: pkg, actions }));
}

/**
 * The starting config for a new step. A step is added ready to read rather than
 * blank: `choice` fields start on their first option, fields with an explicit
 * `value` start there, and the rest start on their placeholder — which is a
 * plausible value for that field, not lorem. Everything stays editable.
 */
export function defaultConfig(action: StepAction): Record<string, string> {
  const config: Record<string, string> = {};
  for (const field of action.fields) {
    const initial = field.value ?? (field.kind === "choice" ? field.options?.[0] : field.placeholder);
    if (initial !== undefined) config[field.id] = initial;
  }
  return config;
}

/** The packages a flow depends on, derived from its steps (deduped, in step
 *  order). This is what keeps an automation's Dependencies tab honest. */
export function packagesForSteps(steps: { actionId: string }[]): string[] {
  const seen: string[] = [];
  for (const step of steps) {
    const pkg = BY_ID.get(step.actionId)?.package;
    if (pkg && !seen.includes(pkg)) seen.push(pkg);
  }
  return seen;
}

/** A one-line summary of a configured step, for the flow row ("chromium, headless"). */
export function stepSummary(actionId: string, config: Record<string, string>): string {
  const action = BY_ID.get(actionId);
  if (!action) return "";
  return action.fields
    .map((f) => config[f.id])
    .filter((v) => v != null && v !== "")
    .join(" · ");
}
