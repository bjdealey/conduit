/**
 * The action palette the workflow builder composes flows from.
 *
 * Each action belongs to a package — the same package names that appear in
 * `Workflow.packages` and in Manage → Packages — so a flow's dependencies are
 * derived from its steps rather than typed by hand (see `packagesForSteps`).
 * Fields describe the per-step form the builder renders; they're deliberately
 * shallow (text / number / choice), because this is a prototype of the authoring
 * surface, not an execution engine.
 *
 * Each action also declares what it needs from a runner (`requires`), which is what
 * lets `requirementsForSteps` derive a flow's placement requirements from its content
 * — the same way `packagesForSteps` derives its dependencies.
 *
 * **This array is the fallback, not the source of truth.** The catalogue is served from
 * the `node_types` table via the `node-types` Edge Function; these entries are what the
 * builder falls back to with no backend configured, exactly as `seedConnectedWorkflows`
 * backs the workflow list. One code path either way.
 */
import { AUTH_MODELS, DEFAULT_REQUIREMENTS, type AuthModel, type WorkflowRequirements } from "@conduit/domain";
import type { ActionStep, WorkflowStep } from "./types";

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
  /** Providing package — matches `Workflow.packages` and Manage → Packages. */
  package: string;
  /** One line explaining what the step does, shown under the palette entry. */
  summary: string;
  fields: ActionField[];
  /**
   * What this action needs from a runner, so a flow's requirements can be derived
   * from what it actually does rather than trusted to whoever filled the form in.
   *
   * A function when the need depends on configuration — a browser step only needs an
   * interactive session when it's set to run headed, and pretending otherwise would
   * route every browser flow onto the most expensive class in the pool.
   */
  requires?: NodeRequirement | ((config: Record<string, string>) => NodeRequirement);
  /**
   * `roadmap` surfaces the node in the palette but marks it unbuilt.
   *
   * The AI nodes ship this way deliberately: the vision is explicit that AI lands
   * last and shouldn't lead, so what's being proven here is that the node interface
   * holds an AI step without reshaping — not that the step works.
   */
  readiness?: "live" | "roadmap";
};

/** The part of `WorkflowRequirements` an action can raise. */
export type NodeRequirement = Partial<WorkflowRequirements>;

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
    // Headless browsers run anywhere; only a headed session needs an interactive one.
    requires: (config) => (config.mode === "Headed" ? { ui: "headed" } : {}),
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

  /* --------------------------------------------------------------------- http
     The node stage 1 is built around, and the reason the three fields below start
     *empty* rather than prefilled. Everywhere else a placeholder doubles as the
     starting value, because a step that reads is better than a step that is blank —
     but these steps now really execute, and a plausible-looking URL that isn't one, or
     a body referencing a variable that doesn't exist, would make every new step's
     first run a failure. The placeholder stays as the hint it always was. */
  {
    id: "http.request",
    label: "HTTP request",
    package: "http",
    summary: "Call an API and capture the response.",
    fields: [
      choice("method", "Method", ["GET", "POST", "PUT", "DELETE"]),
      { id: "url", label: "URL", kind: "text", placeholder: "https://api.example.com/v1/invoices", value: "" },
      {
        id: "headers",
        label: "Headers",
        kind: "long",
        placeholder: "authorization: Bearer {{ env.API_TOKEN }}\naccept: application/json",
        value: "",
      },
      { id: "body", label: "Body", kind: "long", placeholder: '{ "id": "{{ response.body.id }}" }', value: "" },
    ],
  },

  /* --------------------------------------------------------------------- data
     The transformation half of an API flow. Between two calls something has to carry
     a value, or a flow can only ever be a chain of calls that ignore each other. */
  {
    id: "data.set",
    label: "Set value",
    package: "data",
    summary: "Name a value from the run, for later steps to use.",
    fields: [
      text("name", "Name", "status"),
      { id: "value", label: "Value", kind: "long", placeholder: "{{ response.status }}" },
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
    fields: [text("url", "Link", "{{ response.headers.location }}"), number("within", "Within (s)", "10")],
  },

  /* ------------------------------------------------------------------- records */
  {
    id: "records.query",
    label: "Query records",
    package: "billing-api",
    summary: "Read a set of records to work through.",
    fields: [text("source", "Source", "invoices"), text("filter", "Filter", "status = 'open'"), number("limit", "Limit", "500")],
    requires: { auth: "api-key" },
  },
  {
    id: "ledger.reconcile",
    label: "Reconcile ledger",
    package: "ledger",
    summary: "Match authorised payments against ledger entries.",
    fields: [text("account", "Account", "merchant-eu"), choice("onMismatch", "On mismatch", ["Flag", "Fail run", "Ignore"])],
    requires: { auth: "api-key" },
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
    requires: { auth: "managed-identity" },
  },
  {
    id: "email.send",
    label: "Send email",
    package: "email-ses",
    summary: "Send a templated email.",
    fields: [text("to", "To", "{{ user.email }}"), text("template", "Template", "welcome-v2"), text("subject", "Subject", "Welcome to Conduit")],
    requires: { auth: "api-key" },
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
    requires: { auth: "api-key" },
  },
  {
    id: "metrics.record",
    label: "Record metric",
    package: "metrics",
    summary: "Emit a metric point from the run.",
    fields: [text("name", "Metric", "login.latency"), text("value", "Value", "{{ timer.elapsed }}")],
  },

  /* ------------------------------------------------------------------------ ai
     Three stubs, through the same interface as everything above — same shape,
     same `requires`, same derivation. That is the entire point: the claim being
     tested is that an AI step needs no special case in the runtime or the
     canvas. They are marked `roadmap` because none of them execute, and the
     vision is explicit that AI lands last rather than leading. */
  {
    id: "ai.extract",
    label: "Extract from document",
    package: "ai",
    summary: "Pull structured fields out of an unstructured document.",
    fields: [
      text("source", "Document", "{{ attachment.url }}"),
      { id: "schema", label: "Fields", kind: "long", placeholder: "invoiceNumber, total, dueDate" },
    ],
    requires: { auth: "api-key" },
    readiness: "roadmap",
  },
  {
    id: "ai.classify",
    label: "Classify input",
    package: "ai",
    summary: "Sort an input into one of a set of categories.",
    fields: [
      text("input", "Input", "{{ email.body }}"),
      { id: "labels", label: "Categories", kind: "long", placeholder: "billing, technical, account" },
    ],
    requires: { auth: "api-key" },
    readiness: "roadmap",
  },
  {
    id: "ai.summarise",
    label: "Summarise",
    package: "ai",
    summary: "Condense a long input to a short summary.",
    fields: [text("input", "Input", "{{ ticket.thread }}"), number("maxWords", "Max words", "120")],
    requires: { auth: "api-key" },
    readiness: "roadmap",
  },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/** Look up a palette action by id. */
export const actionById = (id: string): StepAction | undefined => BY_ID.get(id);

/** Palette actions grouped by package, in declaration order. */
export function actionsByPackage(catalogue: readonly StepAction[] = ACTIONS): { package: string; actions: StepAction[] }[] {
  const groups = new Map<string, StepAction[]>();
  for (const action of catalogue) {
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

/**
 * Every action in a flow, in execution order, flattened out of the tree.
 *
 * Both derivations below walk this rather than the top-level list, because a branch's
 * contents are still part of what the flow does: a headed step inside an `else` makes
 * the whole workflow headed, and a package used only on the unhappy path is still a
 * dependency. Deriving from the top level alone would understate both — and
 * understating requirements is how a flow lands on a runner that cannot carry it.
 */
export function flattenSteps(steps: readonly WorkflowStep[]): ActionStep[] {
  const out: ActionStep[] = [];
  for (const step of steps) {
    // Discriminate on "is it a branch" rather than "is it an action": a step that
    // arrives without a `kind` is far likelier to be a v1 action that missed
    // migration than a branch, and reading `.then` off it would take the page down.
    if (step.kind === "branch") out.push(...flattenSteps(step.then ?? []), ...flattenSteps(step.else ?? []));
    else out.push(step as ActionStep);
  }
  return out;
}

/** Every step in a flow including the branches themselves, for id allocation and counting. */
export function allSteps(steps: readonly WorkflowStep[]): WorkflowStep[] {
  return steps.flatMap((step) =>
    step.kind === "branch" ? [step, ...allSteps(step.then ?? []), ...allSteps(step.else ?? [])] : [step],
  );
}

/** The packages a flow depends on, derived from its steps (deduped, in step
 *  order). This is what keeps a workflow's Dependencies tab honest. */
export function packagesForSteps(steps: readonly WorkflowStep[]): string[] {
  const seen: string[] = [];
  for (const step of flattenSteps(steps)) {
    const pkg = BY_ID.get(step.actionId)?.package;
    if (pkg && !seen.includes(pkg)) seen.push(pkg);
  }
  return seen;
}

/**
 * How demanding each auth model is. Merging two steps keeps the more demanding of
 * the two, because a flow that needs Windows-integrated auth anywhere needs a runner
 * that can present it everywhere — there is one runner per run.
 */
const AUTH_RANK = new Map<AuthModel, number>(AUTH_MODELS.map((m, i) => [m, i]));

/** The stricter of two auth models. */
const strictestAuth = (a: AuthModel, b: AuthModel): AuthModel =>
  (AUTH_RANK.get(b) ?? 0) > (AUTH_RANK.get(a) ?? 0) ? b : a;

/**
 * The requirements a flow's steps impose, derived from the actions they use — the
 * floor beneath whatever the author declared. This is what keeps a workflow's
 * placement honest: add a headed browser step and the flow becomes headed, whether or
 * not anyone remembers to say so.
 *
 * Same contract as `packagesForSteps`: read the steps, derive the truth, don't ask.
 */
export function requirementsForSteps(steps: readonly WorkflowStep[]): WorkflowRequirements {
  let derived: WorkflowRequirements = { ...DEFAULT_REQUIREMENTS };
  for (const step of flattenSteps(steps)) {
    const action = BY_ID.get(step.actionId);
    if (!action?.requires) continue;
    const need = typeof action.requires === "function" ? action.requires(step.config) : action.requires;
    derived = {
      auth: need.auth ? strictestAuth(derived.auth, need.auth) : derived.auth,
      ui: need.ui === "headed" ? "headed" : derived.ui,
      platform: need.platform === "windows" ? "windows" : derived.platform,
    };
  }
  return derived;
}

/** The declared requirements raised to the floor its steps impose. Never lower than
 *  either, so an author can ask for more than the steps need but never for less. */
export function effectiveRequirements(
  declared: WorkflowRequirements,
  steps: readonly WorkflowStep[],
): WorkflowRequirements {
  const derived = requirementsForSteps(steps);
  return {
    auth: strictestAuth(declared.auth, derived.auth),
    ui: declared.ui === "headed" || derived.ui === "headed" ? "headed" : "none",
    platform: declared.platform === "windows" || derived.platform === "windows" ? "windows" : "any",
  };
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
