import type { LibraryFile } from "./types";

/**
 * Seed files for the library tree — the artefacts that sit beside a workflow
 * rather than being one: the XML a connector is configured by, and the markdown
 * the people running it read.
 *
 * They exist so the tree is genuinely mixed. A tree whose every leaf is the same
 * kind of thing never has to prove its icons distinguish anything, never has to
 * decide what "open" means for something that isn't runnable, and never exercises
 * a rename that changes a file's type. These do all three.
 *
 * In-memory prototype data — edit freely.
 */

const BILLING_RULES = `<?xml version="1.0" encoding="UTF-8"?>
<rules scope="billing">
  <threshold name="invoice.autoApprove" currency="GBP" max="2500" />
  <threshold name="invoice.escalate"    currency="GBP" min="25000" />
  <retry attempts="3" backoff="exponential" />
  <owner team="Finance Ops" />
</rules>
`;

const SYNTHETICS_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<synthetics>
  <probe name="password-reset" every="15m" region="eu-west-1" />
  <probe name="login"          every="5m"  region="eu-west-1" />
  <alert after="2" channel="#ops-alerts" />
</synthetics>
`;

const LIBRARY_README = `# Shared library

Everything in here is visible to the whole workspace. Anything you're still
working out belongs in **My workflows**, not here.

## What lives where

- **Billing** — finance-owned flows and the thresholds they read.
- **Onboarding** — joiner/leaver automation.
- **Monitoring** — synthetics and the checks that page someone.

## House rules

1. A published workflow carries an approval. There is no path that skips one.
2. Requirements are derived from the steps, not declared by hand.
3. Nothing is pinned to a machine. If you think you need a specific runner,
   what you actually need is a requirement the distributor can read.
`;

const MONITORING_RUNBOOK = `# Synthetics runbook

## When a probe fails twice

1. Check the Activity view for the failing run and open its log.
2. If the failure is a timeout, confirm the target is up before touching
   the probe — a synthetic failing is usually the point.
3. A genuine probe fault: pause the workflow, don't delete it. A deleted
   probe is a gap nobody notices.

## Escalation

Page the on-call in \`#ops-alerts\`. Include the run id — it's the only thing
that ties the failure to a runner and a version.

## Known noise

- \`login\` occasionally fails on deploys. Two consecutive failures is the
  real signal; one is not.
`;

const DRAFT_NOTES = `# Scratch

- try the branch step on the invoice flow
- ask about the 25k escalation threshold — is that per invoice or per batch?
- TODO: name this properly before submitting for review
`;

/**
 * Files in the library, in tree order. Ids use the `fil_` prefix; new ones are
 * minted by `nextId` in `src/lib/library.ts` from the same sequence.
 */
export const files: LibraryFile[] = [
  {
    id: "fil_1",
    name: "README.md",
    folderId: "pub-root",
    visibility: "public",
    ownerId: "ls",
    updatedAgo: "6 days ago",
    content: LIBRARY_README,
  },
  {
    id: "fil_2",
    name: "billing-rules.xml",
    folderId: "pub-billing",
    visibility: "public",
    ownerId: "jk",
    updatedAgo: "3 days ago",
    content: BILLING_RULES,
  },
  {
    id: "fil_3",
    name: "synthetics.config.xml",
    folderId: "pub-monitoring-synth",
    visibility: "public",
    ownerId: "ls",
    updatedAgo: "yesterday",
    content: SYNTHETICS_CONFIG,
  },
  {
    id: "fil_4",
    name: "runbook.md",
    folderId: "pub-monitoring",
    visibility: "public",
    ownerId: "ls",
    updatedAgo: "2 days ago",
    content: MONITORING_RUNBOOK,
  },
  {
    id: "fil_5",
    name: "scratch.md",
    folderId: "prv-drafts",
    visibility: "private",
    ownerId: "ps",
    updatedAgo: "just now",
    content: DRAFT_NOTES,
  },
];
