#!/usr/bin/env node
/**
 * `conduit-runner` — the execution plane's host process.
 *
 * Two modes, and the difference between them is only where the work comes from:
 *
 *   conduit-runner run <flow.json>   one flow, from a file, no backend needed
 *   conduit-runner serve             register, claim, execute, report — forever
 *
 * Everything else is environment (see `config.ts`), because that is the entire
 * configuration surface an ephemeral runner should have.
 */
import { ConfigError, identityFromEnv, serveConfig, workflowEnv, ENV_PREFIX } from "./config.ts";
import { formatEvent, formatSummary, readFlow, runLocal } from "./local.ts";
import { serve } from "./loop.ts";

const USAGE = `conduit-runner — executes Conduit workflows

  conduit-runner run <flow.json> [options]   execute one flow locally and print the log
  conduit-runner serve [options]             poll the control plane for work

Options
  --env NAME=VALUE          a value the flow may read as {{ env.NAME }} (repeatable)
  --allow-private-hosts     let the flow call private/link-local addresses
  --deadline <seconds>      wall-clock budget for the run (run mode)
  --max-runs <n>            exit after n runs (serve mode)
  --json                    print the run result as JSON instead of a log
  -h, --help                this

Environment
  CONDUIT_CONTROL_PLANE_URL   …/functions/v1/runner            (serve)
  CONDUIT_RUNNER_TOKEN        must match the function's RUNNER_TOKEN (serve)
  CONDUIT_RUNNER_NAME         display name in the pool
  CONDUIT_RUNNER_CLASS        lightweight | windows-service-account | windows-interactive
  CONDUIT_RUNNER_PLATFORM     linux | windows | macos
  CONDUIT_AUTH_MODELS         comma-separated, what this runner can present
  CONDUIT_POLL_SECONDS        how often to ask for work (default 2)
  ${ENV_PREFIX}<NAME>            a value the flow may read as {{ env.<NAME> }}
`;

type Args = { command?: string; file?: string; env: Record<string, string>; flags: Record<string, string | true> };

/** Flags that take no value. Listed rather than inferred from what follows them, or
 *  `run --json flow.json` would swallow the filename as `--json`'s value. */
const BOOLEAN_FLAGS = new Set(["allow-private-hosts", "json", "help"]);

/** Hand-rolled rather than a dependency: a runner image should be this file and the
 *  workspace, not this file and a tree of parsing libraries. */
function parse(argv: readonly string[]): Args {
  const args: Args = { env: {}, flags: {} };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") {
      const pair = argv[++i] ?? "";
      const at = pair.indexOf("=");
      if (at <= 0) throw new ConfigError(`--env expects NAME=VALUE, got "${pair}"`);
      args.env[pair.slice(0, at)] = pair.slice(at + 1);
    } else if (arg === "-h") {
      args.flags.help = true;
    } else if (arg.startsWith("--")) {
      const name = arg.slice(2);
      args.flags[name] = BOOLEAN_FLAGS.has(name) ? true : (argv[++i] ?? "");
    } else {
      rest.push(arg);
    }
  }
  args.command = rest[0];
  args.file = rest[1];
  return args;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parse(argv);
  if (args.flags.help || !args.command) {
    console.log(USAGE);
    return args.command ? 0 : 2;
  }

  if (args.command === "run") {
    if (!args.file) throw new ConfigError("run needs a flow file: conduit-runner run <flow.json>");
    const json = args.flags.json === true;
    const result = await runLocal({
      flow: await readFlow(args.file),
      identity: identityFromEnv(),
      // Both sources, so a flow can be given a token without exporting it first.
      env: { ...workflowEnv(process.env), ...args.env },
      allowPrivateHosts: args.flags["allow-private-hosts"] === true,
      deadlineSeconds: args.flags.deadline ? Number(args.flags.deadline) : undefined,
      onEvent: json ? undefined : (event) => console.log(formatEvent(event)),
    });
    console.log(json ? JSON.stringify(result, null, 2) : formatSummary(result));
    // A failed run is a failed command: this is what makes a workflow usable as a
    // check in CI, or in anything else that reads an exit code.
    return result.state === "completed" ? 0 : 1;
  }

  if (args.command === "serve") {
    const config = serveConfig(process.env);
    const summary = await serve(config, {
      maxRuns: args.flags["max-runs"] ? Number(args.flags["max-runs"]) : undefined,
    });
    console.log(`stopped (${summary.stopped}) — ${summary.runsCompleted} completed, ${summary.runsFailed} failed`);
    return summary.runsFailed > 0 ? 1 : 0;
  }

  console.error(`unknown command "${args.command}"\n\n${USAGE}`);
  return 2;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // Configuration problems are the user's to fix and get one clear line; anything
    // else keeps its stack, because it is a bug in the runner.
    if (error instanceof ConfigError) console.error(`conduit-runner: ${error.message}`);
    else console.error(error);
    process.exitCode = 2;
  });
