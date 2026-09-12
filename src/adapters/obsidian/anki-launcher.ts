import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, sep } from "node:path";
import process from "node:process";

import {
  defaultLaunchCandidates,
  parseCommandLine,
  resolveLaunchCommand,
} from "../anki/launch-candidates.js";

/**
 * The only module that touches Node process APIs. Safe because the plugin is
 * `isDesktopOnly`; everything decision-shaped lives in the pure
 * `anki/launch-candidates.ts` next to it.
 */

/** Best-guess launch command for this machine, or null if Anki wasn't found. */
export function detectAnkiCommand(): string | null {
  return resolveLaunchCommand(
    defaultLaunchCandidates(process.platform, process.env),
    {
      exists: existsSync,
      pathEntries: (process.env.PATH ?? "").split(delimiter).filter(Boolean),
      pathSeparator: sep,
    },
  );
}

/**
 * Starts Anki detached, so it outlives Obsidian.
 *
 * Resolves once the child process has actually been spawned — not once Anki is
 * usable. AnkiConnect readiness is the caller's poll loop
 * (`ensureAnkiRunning`), because Anki can sit on a profile password prompt or
 * its own sync dialog long after the process exists.
 */
export function launchAnkiCommand(command: string): Promise<void> {
  const argv = parseCommandLine(command);
  const [executable, ...args] = argv;
  if (!executable) {
    return Promise.reject(new Error("No Anki launch command configured."));
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", (error: Error) => {
      reject(error);
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
