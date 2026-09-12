/**
 * Where Anki lives on each desktop platform, and how to turn a user-typed
 * launch command into an argv.
 *
 * Pure: the caller injects the filesystem probe and the PATH, so the whole
 * detection ladder is unit-testable without touching a real machine. The Node
 * bindings live in `adapters/obsidian/anki-launcher.ts`.
 */

export type LaunchCheck =
  | { path: string; type: "file" }
  | { name: string; type: "binary" };

export interface LaunchCandidate {
  /** What must exist on disk for `command` to be worth running. */
  check: LaunchCheck;
  /** Command line to run once the check passes, ready for `parseCommandLine`. */
  command: string;
}

export interface ResolveLaunchCommandDeps {
  exists: (path: string) => boolean;
  pathEntries: string[];
  pathSeparator: string;
}

/** Wraps a value in double quotes only when it would otherwise split. */
export function quoteArgument(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * Known install locations, most specific first. Deliberately limited to
 * locations that can be verified before spawning anything — an unverifiable
 * guess (a flatpak app id, an AppImage in an arbitrary folder) is left to the
 * user to type into the launch-command setting.
 */
export function defaultLaunchCandidates(
  platform: string,
  env: Record<string, string | undefined>,
): LaunchCandidate[] {
  if (platform === "darwin") {
    const candidates: LaunchCandidate[] = [
      {
        check: { path: "/Applications/Anki.app", type: "file" },
        command: "open -a Anki",
      },
    ];
    if (env.HOME) {
      candidates.push({
        check: { path: `${env.HOME}/Applications/Anki.app`, type: "file" },
        command: "open -a Anki",
      });
    }
    return candidates;
  }

  if (platform === "win32") {
    const paths = [
      env.LOCALAPPDATA
        ? `${env.LOCALAPPDATA}\\Programs\\Anki\\anki.exe`
        : undefined,
      `${env.ProgramFiles ?? "C:\\Program Files"}\\Anki\\anki.exe`,
    ].filter((value): value is string => value !== undefined);
    return paths.map((path) => ({
      check: { path, type: "file" },
      command: quoteArgument(path),
    }));
  }

  if (platform === "linux") {
    return [
      { check: { name: "anki", type: "binary" }, command: "anki" },
      {
        check: {
          path: "/var/lib/flatpak/exports/bin/net.ankiweb.Anki",
          type: "file",
        },
        command: "/var/lib/flatpak/exports/bin/net.ankiweb.Anki",
      },
    ];
  }

  return [];
}

/** First candidate that actually exists on this machine, or null. */
export function resolveLaunchCommand(
  candidates: readonly LaunchCandidate[],
  deps: ResolveLaunchCommandDeps,
): string | null {
  for (const candidate of candidates) {
    if (candidate.check.type === "file") {
      if (deps.exists(candidate.check.path)) return candidate.command;
      continue;
    }
    const name = candidate.check.name;
    for (const entry of deps.pathEntries) {
      if (deps.exists(`${entry}${deps.pathSeparator}${name}`)) {
        return candidate.command;
      }
    }
  }
  return null;
}

/**
 * Splits a command line into argv, honouring single and double quotes so
 * Windows paths with spaces survive. Deliberately not a shell: no expansion,
 * no operators — the argv is passed to `spawn` without `shell: true`.
 */
export function parseCommandLine(input: string): string[] {
  const argv: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let started = false;

  for (const char of input) {
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        argv.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }

  if (started) argv.push(current);
  return argv;
}
