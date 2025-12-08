import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import { info } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveHeartbeatSeconds } from "../web/reconnect.js";
import {
  createWaSocket,
  getStatusCode,
  getWebAuthAgeMs,
  logWebSelfId,
  waitForWaConnection,
  webAuthExists,
} from "../web/session.js";

type HealthConnect = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs: number;
};

export type HealthSummary = {
  ts: number;
  durationMs: number;
  web: {
    linked: boolean;
    authAgeMs: number | null;
    connect?: HealthConnect;
  };
  heartbeatSeconds: number;
  sessions: {
    path: string;
    count: number;
    recent: Array<{
      key: string;
      updatedAt: number | null;
      age: number | null;
    }>;
  };
  ipc: { path: string; exists: boolean };
};

const DEFAULT_TIMEOUT_MS = 10_000;

async function probeWebConnect(timeoutMs: number): Promise<HealthConnect> {
  const started = Date.now();
  const sock = await createWaSocket(false, false);
  try {
    await Promise.race([
      waitForWaConnection(sock),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
    return {
      ok: true,
      status: null,
      error: null,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      status: getStatusCode(err),
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    };
  } finally {
    try {
      sock.ws?.close();
    } catch {
      // ignore
    }
  }
}

export async function getHealthSnapshot(
  timeoutMs?: number,
): Promise<HealthSummary> {
  const cfg = loadConfig();
  const linked = await webAuthExists();
  const authAgeMs = getWebAuthAgeMs();
  const heartbeatSeconds = resolveHeartbeatSeconds(cfg, undefined);
  const storePath = resolveStorePath(cfg.inbound?.reply?.session?.store);
  const store = loadSessionStore(storePath);
  const sessions = Object.entries(store)
    .filter(([key]) => key !== "global" && key !== "unknown")
    .map(([key, entry]) => ({ key, updatedAt: entry?.updatedAt ?? 0 }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = sessions.slice(0, 5).map((s) => ({
    key: s.key,
    updatedAt: s.updatedAt || null,
    age: s.updatedAt ? Date.now() - s.updatedAt : null,
  }));

  const ipcPath = path.join(process.env.HOME ?? "", ".clawdis", "clawdis.sock");
  const ipcExists = Boolean(ipcPath) && fs.existsSync(ipcPath);

  const start = Date.now();
  const cappedTimeout = Math.max(1000, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const connect = linked ? await probeWebConnect(cappedTimeout) : undefined;

  const summary: HealthSummary = {
    ts: Date.now(),
    durationMs: Date.now() - start,
    web: { linked, authAgeMs, connect },
    heartbeatSeconds,
    sessions: {
      path: storePath,
      count: sessions.length,
      recent,
    },
    ipc: { path: ipcPath, exists: ipcExists },
  };

  return summary;
}

export async function healthCommand(
  opts: { json?: boolean; timeoutMs?: number },
  runtime: RuntimeEnv,
) {
  const summary = await getHealthSnapshot(opts.timeoutMs);
  const fatal =
    !summary.web.linked || (summary.web.connect && !summary.web.connect.ok);

  if (opts.json) {
    runtime.log(JSON.stringify(summary, null, 2));
  } else {
    runtime.log(
      summary.web.linked
        ? `Web: linked (auth age ${summary.web.authAgeMs ? `${Math.round(summary.web.authAgeMs / 60000)}m` : "unknown"})`
        : "Web: not linked (run clawdis login)",
    );
    if (summary.web.linked) {
      logWebSelfId(runtime, true);
    }
    if (summary.web.connect) {
      const base = summary.web.connect.ok
        ? info(`Connect: ok (${summary.web.connect.elapsedMs}ms)`)
        : `Connect: failed (${summary.web.connect.status ?? "unknown"})`;
      runtime.log(
        base +
          (summary.web.connect.error ? ` - ${summary.web.connect.error}` : ""),
      );
    }
    runtime.log(info(`Heartbeat interval: ${summary.heartbeatSeconds}s`));
    runtime.log(
      info(
        `Session store: ${summary.sessions.path} (${summary.sessions.count} entries)`,
      ),
    );
    if (summary.sessions.recent.length > 0) {
      runtime.log("Recent sessions:");
      for (const r of summary.sessions.recent) {
        runtime.log(
          `- ${r.key} (${r.updatedAt ? `${Math.round((Date.now() - r.updatedAt) / 60000)}m ago` : "no activity"})`,
        );
      }
    }
    runtime.log(
      info(
        `IPC socket: ${summary.ipc.exists ? "present" : "missing"} (${summary.ipc.path})`,
      ),
    );
  }

  if (fatal) {
    runtime.exit(1);
  }
}
