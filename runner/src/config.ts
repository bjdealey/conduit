/**
 * What this runner is, and where it reports.
 *
 * Everything here is read from the environment at boot, because that is the entire
 * configuration surface an ephemeral runner is allowed to have. There is no config
 * file to drift, no local state to accumulate, and nothing to patch: a runner is
 * started, it works, and it is thrown away. That is inversion 2, kept honest at the
 * one place it would be easiest to break.
 */
import { AUTH_MODELS, RUNNER_CLASSES, RUNNER_PLATFORMS, type AuthModel, type RunnerClass, type RunnerPlatform } from "@conduit/domain";

/** Where the environment values a workflow may read are prefixed. */
export const ENV_PREFIX = "CONDUIT_ENV_";

/** What this runner announces at registration. */
export type RunnerIdentity = {
  runnerId: string;
  name: string;
  runnerClass: RunnerClass;
  platform: RunnerPlatform;
  /** What it can present to a target system. Only what it can actually do — a runner
   *  that declares an auth model it cannot present will be handed work it must fail. */
  authModels: AuthModel[];
  headed: boolean;
  ephemeral: boolean;
  /** The only version a runner carries. */
  image: string;
};

/** Identity plus where to report and how to behave. */
export type RunnerConfig = RunnerIdentity & {
  /** The `runner` Edge Function's base URL, e.g.
   *  `https://<ref>.supabase.co/functions/v1/runner`. */
  controlPlaneUrl: string;
  /** The shared runner token. Never a user JWT: runners are not users. */
  token: string;
  /** How often to ask for work while idle. */
  pollSeconds: number;
  /** Values a workflow may read as `{{ env.NAME }}`, from `CONDUIT_ENV_*`. */
  env: Record<string, string>;
  /** Whether workflows may call private/link-local addresses. Off by default. */
  allowPrivateHosts: boolean;
};

/** Configuration that is missing or contradicts itself. Fatal at boot, deliberately:
 *  a runner that starts half-configured fails later, on someone's workflow. */
export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

const one = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, name: string): T => {
  if (value === undefined || value === "") return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ConfigError(`${name}="${value}" is not one of: ${allowed.join(", ")}`);
  }
  return value as T;
};

const list = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T[], name: string): T[] => {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => one(item, allowed, item as T, name));
};

/** The values a workflow may read, lifted out of the process environment.
 *
 *  Prefixed rather than passed wholesale: a runner's environment holds its own token
 *  and whatever the host put there, and handing all of it to a workflow authored by
 *  someone else is how a flow exfiltrates a control-plane credential. Opting a value in
 *  is one rename; opting every value in is one mistake. */
export function workflowEnv(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(ENV_PREFIX) && value !== undefined) out[key.slice(ENV_PREFIX.length)] = value;
  }
  return out;
}

/** A per-boot runner id. A new process is a new runner — that is what ephemeral means. */
function bootId(platform: string): string {
  return `rnr_${platform}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Read the runner's identity from the environment, with no control-plane requirement.
 *  Local mode uses this half; `serveConfig` adds the reporting half on top. */
export function identityFromEnv(env: Env = process.env): RunnerIdentity {
  const platform = one(env.CONDUIT_RUNNER_PLATFORM, RUNNER_PLATFORMS, "linux", "CONDUIT_RUNNER_PLATFORM");
  const runnerClass = one(env.CONDUIT_RUNNER_CLASS, RUNNER_CLASSES, "lightweight", "CONDUIT_RUNNER_CLASS");
  const runnerId = env.CONDUIT_RUNNER_ID || bootId(platform);
  return {
    runnerId,
    name: env.CONDUIT_RUNNER_NAME || runnerId,
    runnerClass,
    platform,
    // Stage 1 executes API nodes: a bearer token or an API key is what it can present,
    // and it says so rather than claiming models the engine cannot perform.
    authModels: list(env.CONDUIT_AUTH_MODELS, AUTH_MODELS, ["none", "api-key"], "CONDUIT_AUTH_MODELS"),
    // No browser in this image. Declaring otherwise would make it claimable for headed
    // work it would then fail — the pool would look like it had capacity it hasn't.
    headed: env.CONDUIT_RUNNER_HEADED === "1",
    ephemeral: env.CONDUIT_RUNNER_EPHEMERAL !== "0",
    image: env.CONDUIT_RUNNER_IMAGE || "conduit/runner-node:0.1.0",
  };
}

/** The full configuration for the polling mode. */
export function serveConfig(env: Env = process.env): RunnerConfig {
  const controlPlaneUrl = (env.CONDUIT_CONTROL_PLANE_URL ?? "").replace(/\/+$/, "");
  if (!controlPlaneUrl) throw new ConfigError("CONDUIT_CONTROL_PLANE_URL is required (…/functions/v1/runner)");
  const token = env.CONDUIT_RUNNER_TOKEN ?? "";
  if (!token) throw new ConfigError("CONDUIT_RUNNER_TOKEN is required (it must match the function's RUNNER_TOKEN)");

  const pollSeconds = Number(env.CONDUIT_POLL_SECONDS ?? 2);
  if (!Number.isFinite(pollSeconds) || pollSeconds <= 0) throw new ConfigError("CONDUIT_POLL_SECONDS must be a positive number");

  return {
    ...identityFromEnv(env),
    controlPlaneUrl,
    token,
    pollSeconds,
    env: workflowEnv(env),
    allowPrivateHosts: env.CONDUIT_ALLOW_PRIVATE_HOSTS === "1",
  };
}
