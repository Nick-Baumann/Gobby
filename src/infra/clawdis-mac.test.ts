import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { RuntimeEnv } from "../runtime.js";

const runExecCalls = vi.hoisted(
  () => [] as Array<{ cmd: string; args: string[] }>,
);
const runCommandCalls = vi.hoisted(
  () => [] as Array<{ argv: string[]; timeoutMs: number }>,
);

let runExecThrows = false;

vi.mock("../process/exec.js", () => ({
  runExec: vi.fn(async (cmd: string, args: string[]) => {
    runExecCalls.push({ cmd, args });
    if (runExecThrows) throw new Error("which failed");
    return { stdout: "/usr/local/bin/clawdis-mac\n", stderr: "" };
  }),
  runCommandWithTimeout: vi.fn(async (argv: string[], timeoutMs: number) => {
    runCommandCalls.push({ argv, timeoutMs });
    return { stdout: "ok", stderr: "", code: 0 };
  }),
}));

import { resolveClawdisMacBinary, runClawdisMac } from "./clawdis-mac.js";

describe("clawdis-mac binary resolver", () => {
  it("uses env override on macOS and errors elsewhere", async () => {
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    };

    if (process.platform === "darwin") {
      vi.stubEnv("CLAWDIS_MAC_BIN", "/opt/bin/clawdis-mac");
      await expect(resolveClawdisMacBinary(runtime)).resolves.toBe(
        "/opt/bin/clawdis-mac",
      );
      return;
    }

    await expect(resolveClawdisMacBinary(runtime)).rejects.toThrow(/exit 1/);
  });

  it("runs the helper with --json when requested", async () => {
    if (process.platform !== "darwin") return;
    vi.stubEnv("CLAWDIS_MAC_BIN", "/opt/bin/clawdis-mac");

    const res = await runClawdisMac(["browser", "status"], {
      json: true,
      timeoutMs: 1234,
    });

    expect(res).toMatchObject({ stdout: "ok", code: 0 });
    expect(runCommandCalls.length).toBeGreaterThan(0);
    expect(runCommandCalls.at(-1)?.argv).toEqual([
      "/opt/bin/clawdis-mac",
      "--json",
      "browser",
      "status",
    ]);
    expect(runCommandCalls.at(-1)?.timeoutMs).toBe(1234);
  });

  it("falls back to `which clawdis-mac` when no override is set", async () => {
    if (process.platform !== "darwin") return;
    vi.stubEnv("CLAWDIS_MAC_BIN", "");

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    };

    const resolved = await resolveClawdisMacBinary(runtime);
    expect(resolved).toBe("/usr/local/bin/clawdis-mac");
    expect(runExecCalls.some((c) => c.cmd === "which")).toBe(true);
  });

  it("falls back to ./bin/clawdis-mac when which fails", async () => {
    if (process.platform !== "darwin") return;

    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "clawdis-mac-test-"));
    const oldCwd = process.cwd();
    try {
      const binDir = path.join(tmp, "bin");
      await fsp.mkdir(binDir, { recursive: true });
      const exePath = path.join(binDir, "clawdis-mac");
      await fsp.writeFile(exePath, "#!/bin/sh\necho ok\n", "utf-8");
      await fsp.chmod(exePath, 0o755);

      process.chdir(tmp);
      vi.stubEnv("CLAWDIS_MAC_BIN", "");
      runExecThrows = true;

      const runtime: RuntimeEnv = {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number) => {
          throw new Error(`exit ${code}`);
        },
      };

      const resolved = await resolveClawdisMacBinary(runtime);
      const expectedReal = await fsp.realpath(exePath);
      const resolvedReal = await fsp.realpath(resolved);
      expect(resolvedReal).toBe(expectedReal);
    } finally {
      runExecThrows = false;
      process.chdir(oldCwd);
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  });
});
