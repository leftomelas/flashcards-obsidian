import { describe, expect, test } from "vitest";

import {
  defaultLaunchCandidates,
  parseCommandLine,
  quoteArgument,
  resolveLaunchCommand,
} from "../../../src/adapters/anki/launch-candidates.js";

describe("defaultLaunchCandidates", () => {
  test("macOS checks both bundle locations and launches via `open -a`", () => {
    expect(defaultLaunchCandidates("darwin", { HOME: "/Users/alex" })).toEqual([
      {
        check: { path: "/Applications/Anki.app", type: "file" },
        command: "open -a Anki",
      },
      {
        check: { path: "/Users/alex/Applications/Anki.app", type: "file" },
        command: "open -a Anki",
      },
    ]);
  });

  test("Windows probes the per-user install before the machine-wide one", () => {
    expect(
      defaultLaunchCandidates("win32", {
        LOCALAPPDATA: "C:\\Users\\alex\\AppData\\Local",
        ProgramFiles: "C:\\Program Files",
      }),
    ).toEqual([
      {
        check: {
          path: "C:\\Users\\alex\\AppData\\Local\\Programs\\Anki\\anki.exe",
          type: "file",
        },
        command: "C:\\Users\\alex\\AppData\\Local\\Programs\\Anki\\anki.exe",
      },
      {
        check: { path: "C:\\Program Files\\Anki\\anki.exe", type: "file" },
        command: '"C:\\Program Files\\Anki\\anki.exe"',
      },
    ]);
  });

  test("Windows falls back to the literal default when env vars are absent", () => {
    expect(defaultLaunchCandidates("win32", {}).map((c) => c.check)).toEqual([
      { path: "C:\\Program Files\\Anki\\anki.exe", type: "file" },
    ]);
  });

  test("Linux checks PATH first, then the flatpak export", () => {
    expect(defaultLaunchCandidates("linux", {})).toEqual([
      { check: { name: "anki", type: "binary" }, command: "anki" },
      {
        check: {
          path: "/var/lib/flatpak/exports/bin/net.ankiweb.Anki",
          type: "file",
        },
        command: "/var/lib/flatpak/exports/bin/net.ankiweb.Anki",
      },
    ]);
  });

  test("unknown platforms produce no candidates", () => {
    expect(defaultLaunchCandidates("aix", {})).toEqual([]);
  });
});

describe("resolveLaunchCommand", () => {
  const linux = defaultLaunchCandidates("linux", {});

  test("returns the first candidate whose file exists", () => {
    const command = resolveLaunchCommand(linux, {
      exists: (p) => p === "/var/lib/flatpak/exports/bin/net.ankiweb.Anki",
      pathEntries: ["/usr/bin"],
      pathSeparator: "/",
    });
    expect(command).toBe("/var/lib/flatpak/exports/bin/net.ankiweb.Anki");
  });

  test("resolves a binary candidate against PATH entries in order", () => {
    const command = resolveLaunchCommand(linux, {
      exists: (p) => p === "/usr/local/bin/anki",
      pathEntries: ["/usr/bin", "/usr/local/bin"],
      pathSeparator: "/",
    });
    expect(command).toBe("anki");
  });

  test("returns null when nothing on the machine matches", () => {
    expect(
      resolveLaunchCommand(linux, {
        exists: () => false,
        pathEntries: ["/usr/bin"],
        pathSeparator: "/",
      }),
    ).toBeNull();
  });

  test("returns null for a platform without candidates", () => {
    expect(
      resolveLaunchCommand([], {
        exists: () => true,
        pathEntries: [],
        pathSeparator: "/",
      }),
    ).toBeNull();
  });
});

describe("quoteArgument", () => {
  test("quotes only when the value contains whitespace", () => {
    expect(quoteArgument("/usr/local/bin/anki")).toBe("/usr/local/bin/anki");
    expect(quoteArgument("C:\\Program Files\\Anki\\anki.exe")).toBe(
      '"C:\\Program Files\\Anki\\anki.exe"',
    );
  });
});

describe("parseCommandLine", () => {
  test("splits a bare command on whitespace", () => {
    expect(parseCommandLine("flatpak run net.ankiweb.Anki")).toEqual([
      "flatpak",
      "run",
      "net.ankiweb.Anki",
    ]);
  });

  test("keeps a double-quoted Windows path with spaces intact", () => {
    expect(
      parseCommandLine('"C:\\Program Files\\Anki\\anki.exe" --no-splash'),
    ).toEqual(["C:\\Program Files\\Anki\\anki.exe", "--no-splash"]);
  });

  test("keeps a single-quoted segment intact", () => {
    expect(parseCommandLine("open -a 'Anki Beta'")).toEqual([
      "open",
      "-a",
      "Anki Beta",
    ]);
  });

  test("collapses repeated and surrounding whitespace", () => {
    expect(parseCommandLine("  anki   --profile  Main ")).toEqual([
      "anki",
      "--profile",
      "Main",
    ]);
  });

  test("returns an empty argv for blank input", () => {
    expect(parseCommandLine("")).toEqual([]);
    expect(parseCommandLine("   ")).toEqual([]);
  });

  test("an unterminated quote still yields the trailing segment", () => {
    expect(parseCommandLine('anki "Main Profile')).toEqual([
      "anki",
      "Main Profile",
    ]);
  });

  test("round-trips a quoted candidate command", () => {
    const command = quoteArgument("C:\\Program Files\\Anki\\anki.exe");
    expect(parseCommandLine(command)).toEqual([
      "C:\\Program Files\\Anki\\anki.exe",
    ]);
  });
});
