import { describe, expect, test, vi } from "vitest";

import {
  ensureAnkiRunning,
  POLL_INTERVAL_MS,
  type AnkiWaitHandle,
  type EnsureAnkiRunningDeps,
} from "../../../src/adapters/anki/ensure-anki-running.js";

interface Harness {
  deps: EnsureAnkiRunningDeps;
  handles: Array<{ cancel: () => void; hidden: boolean; message: string }>;
  sleeps: number[];
}

/**
 * `probeResults` is consumed one entry per probe; the last entry repeats once
 * exhausted, so `[false]` models "Anki never comes up".
 */
function makeHarness(
  probeResults: boolean[],
  overrides: Partial<EnsureAnkiRunningDeps> = {},
): Harness {
  const queue = [...probeResults];
  const sleeps: number[] = [];
  const handles: Harness["handles"] = [];

  const deps: EnsureAnkiRunningDeps = {
    notify: (message: string): AnkiWaitHandle => {
      const handle = { cancel: () => {}, hidden: false, message };
      let cancelled = false;
      handle.cancel = () => {
        cancelled = true;
      };
      handles.push(handle);
      return {
        cancelled: () => cancelled,
        hide: () => {
          handle.hidden = true;
        },
      };
    },
    probe: vi.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0]!)),
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
    }),
    timeoutMs: 5 * POLL_INTERVAL_MS,
    ...overrides,
  };

  return { deps, handles, sleeps };
}

describe("ensureAnkiRunning", () => {
  test("returns ready without notifying when Anki already answers", async () => {
    const harness = makeHarness([true]);
    const launch = vi.fn(async () => {});

    const result = await ensureAnkiRunning({ ...harness.deps, launch });

    expect(result).toEqual({ launched: false, status: "ready" });
    expect(launch).not.toHaveBeenCalled();
    expect(harness.handles).toHaveLength(0);
    expect(harness.deps.probe).toHaveBeenCalledTimes(1);
  });

  test("launches Anki, waits, and reports ready once it answers", async () => {
    const harness = makeHarness([false, false, true]);
    const launch = vi.fn(async () => {});

    const result = await ensureAnkiRunning({ ...harness.deps, launch });

    expect(result).toEqual({ launched: true, status: "ready" });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(harness.handles[0]?.message).toContain("Starting Anki");
    expect(harness.handles[0]?.hidden).toBe(true);
    expect(harness.sleeps).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS]);
  });

  test("without a launcher it waits for the user to start Anki", async () => {
    const harness = makeHarness([false, true]);

    const result = await ensureAnkiRunning(harness.deps);

    expect(result).toEqual({ launched: false, status: "ready" });
    expect(harness.handles[0]?.message).toContain("Anki is not running");
    expect(harness.handles[0]?.message).toContain("click to cancel");
  });

  test("a failing launcher degrades to waiting and reports the error", async () => {
    const harness = makeHarness([false]);
    const launch = vi.fn(async () => {
      throw new Error("spawn ENOENT");
    });

    const result = await ensureAnkiRunning({ ...harness.deps, launch });

    expect(result).toEqual({
      launchError: "spawn ENOENT",
      status: "timeout",
    });
    expect(harness.handles[0]?.message).toContain("Anki is not running");
  });

  test("times out after timeoutMs without probing forever", async () => {
    const harness = makeHarness([false]);

    const result = await ensureAnkiRunning(harness.deps);

    expect(result).toEqual({ status: "timeout" });
    // One probe up front, then one per poll interval within the budget.
    expect(harness.deps.probe).toHaveBeenCalledTimes(6);
    expect(harness.handles[0]?.hidden).toBe(true);
  });

  test("stops early when the user cancels the wait", async () => {
    const harness = makeHarness([false]);
    const deps: EnsureAnkiRunningDeps = {
      ...harness.deps,
      sleep: vi.fn(async () => {
        harness.handles[0]?.cancel();
      }),
    };

    const result = await ensureAnkiRunning(deps);

    expect(result).toEqual({ status: "cancelled" });
    expect(deps.probe).toHaveBeenCalledTimes(1);
    expect(harness.handles[0]?.hidden).toBe(true);
  });

  test("a probe that throws counts as unreachable rather than failing the sync", async () => {
    const probe = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue(true);
    const harness = makeHarness([false], { probe });

    const result = await ensureAnkiRunning(harness.deps);

    expect(result).toEqual({ launched: false, status: "ready" });
  });
});
