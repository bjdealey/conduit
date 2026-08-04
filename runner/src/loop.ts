/**
 * The polling loop — a runner's whole life.
 *
 * Register, then two things at once: heartbeat on the interval the control plane
 * asked for, and ask for work whenever idle. Nothing is ever pushed to a runner and a
 * runner never names what it wants; it says what it is, and takes what it is given.
 *
 * The loop exits on drain (the control plane winding the pool in), on `maxRuns` (an
 * ephemeral runner configured to do one job and die), or on a run of empty claims when
 * a caller asked it to. It does not exit on an error: a control plane that is briefly
 * unreachable is a normal Tuesday, and a runner that quits over one failed heartbeat
 * turns a blip into a capacity dip.
 */
import { MAX_EVENTS_PER_BATCH, type RunEvent } from "@conduit/domain";
import { controlPlane, ProtocolError, type ControlPlane, type RunnerState } from "./client.ts";
import type { RunnerConfig } from "./config.ts";
import { runWork } from "./execute.ts";

/** Events buffered before a flush is worth making. Well under the wire limit: this is
 *  about not making one request per log line, not about filling the batch. */
const FLUSH_AT = 25;

/** How the loop is driven, and how it is stopped. Everything is injectable so the
 *  tests drive a whole runner without a network or a real clock. */
export type ServeOptions = {
  control?: ControlPlane;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  /** Stop after this many runs. 0 = keep going. */
  maxRuns?: number;
  /** Stop after this many consecutive empty claims. 0 = keep going. */
  maxIdlePolls?: number;
};

/** Why the loop stopped, and what it did. */
export type ServeSummary = {
  runnerId: string;
  runsCompleted: number;
  runsFailed: number;
  stopped: "drain" | "max-runs" | "idle";
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function serve(config: RunnerConfig, options: ServeOptions = {}): Promise<ServeSummary> {
  const control = options.control ?? controlPlane(config);
  const log = options.log ?? ((line: string) => console.log(line));
  const sleep = options.sleep ?? wait;

  const registration = await control.register();
  log(`registered ${config.name} (${config.runnerClass}/${config.platform}) — heartbeat ${registration.heartbeatSeconds}s`);

  const status = {
    state: "idle" as RunnerState,
    currentRunId: undefined as string | undefined,
    runsCompleted: 0,
    runsFailed: 0,
    drain: false,
    stopped: false,
  };

  /* ------------------------------------------------------------- heartbeating */
  const beating = (async () => {
    while (!status.stopped) {
      await sleep(registration.heartbeatSeconds * 1000);
      if (status.stopped) break;
      try {
        const { drain } = await control.heartbeat({
          state: status.drain ? "draining" : status.state,
          currentRunId: status.currentRunId,
          runsCompleted: status.runsCompleted,
        });
        // Drain means finish what you are doing, then go. It is recomputed by the
        // control plane on every beat, so it is a current answer rather than a flag
        // set once when demand looked different.
        if (drain && !status.drain) {
          status.drain = true;
          log("drain requested — finishing the current run, then exiting");
        }
      } catch (error) {
        log(`heartbeat failed: ${(error as Error).message}`);
      }
    }
  })();

  /* --------------------------------------------------------------- ingesting */
  let pending: RunEvent[] = [];
  let flushing: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    flushing = flushing.then(async () => {
      while (pending.length > 0) {
        const batch = pending.slice(0, MAX_EVENTS_PER_BATCH);
        try {
          await control.ingest(batch);
          pending = pending.slice(batch.length);
        } catch (error) {
          // The run log is the only account of what happened, so losing it silently is
          // not an option — but neither is blocking the runner on a control plane that
          // is down. Say what was lost, and carry on.
          log(`ingest failed, dropping ${pending.length} event(s): ${(error as Error).message}`);
          pending = [];
        }
      }
    });
    return flushing;
  };

  /* ------------------------------------------------------------------- working */
  let idlePolls = 0;
  let stopped: ServeSummary["stopped"] = "drain";

  while (!status.drain) {
    if (options.maxRuns && status.runsCompleted + status.runsFailed >= options.maxRuns) {
      stopped = "max-runs";
      break;
    }

    let work;
    try {
      work = await control.claim();
    } catch (error) {
      log(`claim failed: ${(error as Error).message}`);
      if (error instanceof ProtocolError && error.status === 401) throw error; // a bad token never fixes itself
      await sleep(config.pollSeconds * 1000);
      continue;
    }

    if (!work) {
      idlePolls++;
      if (options.maxIdlePolls && idlePolls >= options.maxIdlePolls) {
        stopped = "idle";
        break;
      }
      await sleep(config.pollSeconds * 1000);
      continue;
    }

    idlePolls = 0;
    status.state = "busy";
    status.currentRunId = work.runId;
    log(`claimed ${work.runId} (${work.workflowId} v${work.workflowVersion})`);

    const result = await runWork(work, config, {
      env: config.env,
      allowPrivateHosts: config.allowPrivateHosts,
      onEvent: (event) => {
        pending.push(event);
        if (pending.length >= FLUSH_AT) void flush();
      },
    });
    await flush();

    if (result.state === "completed") status.runsCompleted++;
    else status.runsFailed++;
    status.state = "idle";
    status.currentRunId = undefined;
    log(`${work.runId} ${result.state} — ${result.stepsExecuted} step(s) in ${result.elapsedMs} ms`);
  }

  status.stopped = true;
  await beating;
  await flush();

  // One last beat, so the pool sees this runner leave rather than time it out. An
  // ephemeral runner going quiet is normal; going quiet *deliberately* is information.
  try {
    await control.heartbeat({ state: "draining", runsCompleted: status.runsCompleted });
  } catch {
    /* leaving anyway */
  }

  return { runnerId: config.runnerId, runsCompleted: status.runsCompleted, runsFailed: status.runsFailed, stopped };
}
