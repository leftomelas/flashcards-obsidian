/**
 * Gate that runs before any sync work touches Anki: make sure AnkiConnect
 * answers, optionally starting Anki first, and otherwise wait for the user to
 * start it instead of failing the whole command.
 *
 * Pure orchestration — probing, launching, sleeping and notifying are all
 * injected, so every branch is testable without a socket or a process.
 */

export const POLL_INTERVAL_MS = 1000;

/** Handle over the persistent "waiting" notice; clicking it cancels. */
export interface AnkiWaitHandle {
  cancelled: () => boolean;
  hide: () => void;
}

export interface EnsureAnkiRunningDeps {
  /** Absent when auto-launch is off or no command could be resolved. */
  launch?: (() => Promise<void>) | undefined;
  notify: (message: string) => AnkiWaitHandle;
  /** Resolves true when AnkiConnect answered; a rejection counts as "not yet". */
  probe: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}

export type EnsureAnkiRunningResult =
  | { launched: boolean; status: "ready" }
  | { status: "cancelled" }
  | { launchError?: string; status: "timeout" };

const WAITING_MESSAGE =
  "Anki is not running. Start it and this sync will continue automatically (click to cancel).";
const STARTING_MESSAGE =
  "Starting Anki… this sync will continue automatically (click to cancel).";

async function probeQuietly(probe: () => Promise<boolean>): Promise<boolean> {
  try {
    return await probe();
  } catch {
    // A closed port rejects; that is the expected "not up yet" signal.
    return false;
  }
}

export async function ensureAnkiRunning(
  deps: EnsureAnkiRunningDeps,
): Promise<EnsureAnkiRunningResult> {
  if (await probeQuietly(deps.probe)) {
    return { launched: false, status: "ready" };
  }

  let launched = false;
  let launchError: string | undefined;
  if (deps.launch) {
    try {
      await deps.launch();
      launched = true;
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error);
    }
  }

  const handle = deps.notify(launched ? STARTING_MESSAGE : WAITING_MESSAGE);
  try {
    // Budget is expressed in poll intervals: probing a refused port is
    // effectively free, so attempts track wall-clock closely enough.
    const attempts = Math.max(1, Math.floor(deps.timeoutMs / POLL_INTERVAL_MS));
    for (let attempt = 0; attempt < attempts; attempt++) {
      await deps.sleep(POLL_INTERVAL_MS);
      if (handle.cancelled()) return { status: "cancelled" };
      if (await probeQuietly(deps.probe)) {
        return { launched, status: "ready" };
      }
    }
    return launchError === undefined
      ? { status: "timeout" }
      : { launchError, status: "timeout" };
  } finally {
    handle.hide();
  }
}
