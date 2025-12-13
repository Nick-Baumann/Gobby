import type { Server } from "node:http";
import path from "node:path";
import express from "express";

import { loadConfig } from "../config/config.js";
import { logError, logInfo, logWarn } from "../logger.js";
import { ensureMediaDir, saveMediaBuffer } from "../media/store.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import {
  captureScreenshot,
  captureScreenshotPng,
  createTargetViaCdp,
  evaluateJavaScript,
  getDomText,
  querySelector,
  snapshotAria,
  snapshotDom,
} from "./cdp.js";
import {
  isChromeReachable,
  launchClawdChrome,
  type RunningChrome,
  stopClawdChrome,
} from "./chrome.js";
import {
  resolveBrowserConfig,
  shouldStartLocalBrowserServer,
} from "./config.js";
import {
  clickRefViaPlaywright,
  closePlaywrightBrowserConnection,
  snapshotAiViaPlaywright,
} from "./pw-ai.js";
import {
  DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
  DEFAULT_BROWSER_SCREENSHOT_MAX_SIDE,
  normalizeBrowserScreenshot,
} from "./screenshot.js";
import { resolveTargetIdFromTabs } from "./target-id.js";

export type BrowserTab = {
  targetId: string;
  title: string;
  url: string;
  wsUrl?: string;
  type?: string;
};

type BrowserServerState = {
  server: Server;
  port: number;
  cdpPort: number;
  running: RunningChrome | null;
  resolved: ReturnType<typeof resolveBrowserConfig>;
};

let state: BrowserServerState | null = null;

function jsonError(res: express.Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

async function fetchJson<T>(
  url: string,
  timeoutMs = 1500,
  init?: RequestInit,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOk(
  url: string,
  timeoutMs = 1500,
  init?: RequestInit,
): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(t);
  }
}

async function listTabs(cdpPort: number): Promise<BrowserTab[]> {
  const raw = await fetchJson<
    Array<{
      id?: string;
      title?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
      type?: string;
    }>
  >(`http://127.0.0.1:${cdpPort}/json/list`);
  return raw
    .map((t) => ({
      targetId: t.id ?? "",
      title: t.title ?? "",
      url: t.url ?? "",
      wsUrl: t.webSocketDebuggerUrl,
      type: t.type,
    }))
    .filter((t) => Boolean(t.targetId));
}

async function openTab(cdpPort: number, url: string): Promise<BrowserTab> {
  // Prefer CDP websocket Target.createTarget (more stable across Chrome versions),
  // then fall back to /json/new for older/quirky builds.
  const createdViaCdp = await createTargetViaCdp({ cdpPort, url })
    .then((r) => r.targetId)
    .catch(() => null);

  if (createdViaCdp) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const tabs = await listTabs(cdpPort).catch(() => [] as BrowserTab[]);
      const found = tabs.find((t) => t.targetId === createdViaCdp);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { targetId: createdViaCdp, title: "", url, type: "page" };
  }

  const encoded = encodeURIComponent(url);

  type CdpTarget = {
    id?: string;
    title?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
    type?: string;
  };

  // Chrome changed /json/new to require PUT (older versions allowed GET).
  const endpoint = `http://127.0.0.1:${cdpPort}/json/new?${encoded}`;
  const created = await fetchJson<CdpTarget>(endpoint, 1500, {
    method: "PUT",
  }).catch(async (err) => {
    if (String(err).includes("HTTP 405")) {
      return await fetchJson<CdpTarget>(endpoint, 1500);
    }
    throw err;
  });

  if (!created.id) throw new Error("Failed to open tab (missing id)");
  return {
    targetId: created.id,
    title: created.title ?? "",
    url: created.url ?? url,
    wsUrl: created.webSocketDebuggerUrl,
    type: created.type,
  };
}

async function activateTab(cdpPort: number, targetId: string): Promise<void> {
  // Chrome returns plain text ("Target activated") with an application/json content-type.
  await fetchOk(`http://127.0.0.1:${cdpPort}/json/activate/${targetId}`);
}

async function closeTab(cdpPort: number, targetId: string): Promise<void> {
  // Chrome returns plain text ("Target is closing") with an application/json content-type.
  await fetchOk(`http://127.0.0.1:${cdpPort}/json/close/${targetId}`);
}

async function ensureBrowserAvailable(runtime: RuntimeEnv): Promise<void> {
  if (!state) throw new Error("Browser server not started");
  if (await isChromeReachable(state.cdpPort)) return;
  if (state.resolved.attachOnly) {
    throw new Error("Browser attachOnly is enabled and no browser is running.");
  }

  const launched = await launchClawdChrome(state.resolved, runtime);
  state.running = launched;
  launched.proc.on("exit", () => {
    if (state?.running?.pid === launched.pid) {
      state.running = null;
    }
  });
  return;
}

async function ensureTabAvailable(runtime: RuntimeEnv, targetId?: string) {
  if (!state) throw new Error("Browser server not started");
  await ensureBrowserAvailable(runtime);

  const tabs1 = await listTabs(state.cdpPort);
  if (tabs1.length === 0) {
    await openTab(state.cdpPort, "about:blank");
  }

  const tabs = await listTabs(state.cdpPort);
  const chosen = targetId
    ? (() => {
        const resolved = resolveTargetIdFromTabs(targetId, tabs);
        if (!resolved.ok) {
          if (resolved.reason === "ambiguous") return "AMBIGUOUS" as const;
          return null;
        }
        return tabs.find((t) => t.targetId === resolved.targetId) ?? null;
      })()
    : (tabs.at(0) ?? null);

  if (chosen === "AMBIGUOUS") {
    throw new Error("ambiguous target id prefix");
  }
  if (!chosen?.wsUrl) throw new Error("tab not found");
  return chosen;
}

export async function startBrowserControlServerFromConfig(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<BrowserServerState | null> {
  if (state) return state;

  const cfg = loadConfig();
  const resolved = resolveBrowserConfig(cfg.browser);
  if (!resolved.enabled) return null;

  if (!shouldStartLocalBrowserServer(resolved)) {
    logInfo(
      `browser control URL is non-loopback (${resolved.controlUrl}); skipping local server start`,
      runtime,
    );
    return null;
  }

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/", async (_req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const reachable = await isChromeReachable(state.cdpPort, 300);
    res.json({
      enabled: state.resolved.enabled,
      controlUrl: state.resolved.controlUrl,
      running: reachable,
      pid: state.running?.pid ?? null,
      cdpPort: state.cdpPort,
      chosenBrowser: state.running?.exe.kind ?? null,
      userDataDir: state.running?.userDataDir ?? null,
      color: state.resolved.color,
      headless: state.resolved.headless,
      attachOnly: state.resolved.attachOnly,
    });
  });

  app.post("/start", async (_req, res) => {
    try {
      await ensureBrowserAvailable(runtime);
      res.json({ ok: true });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.post("/stop", async (_req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    if (!state.running) return res.json({ ok: true, stopped: false });
    try {
      await stopClawdChrome(state.running);
      state.running = null;
      res.json({ ok: true, stopped: true });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.get("/tabs", async (_req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const reachable = await isChromeReachable(state.cdpPort, 300);
    if (!reachable)
      return res.json({ running: false, tabs: [] as BrowserTab[] });
    try {
      const tabs = await listTabs(state.cdpPort);
      res.json({ running: true, tabs });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.post("/tabs/open", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const url = String((req.body as { url?: unknown })?.url ?? "").trim();
    if (!url) return jsonError(res, 400, "url is required");
    try {
      await ensureBrowserAvailable(runtime);
      const tab = await openTab(state.cdpPort, url);
      res.json(tab);
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.post("/tabs/focus", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const targetId = String(
      (req.body as { targetId?: unknown })?.targetId ?? "",
    ).trim();
    if (!targetId) return jsonError(res, 400, "targetId is required");
    const reachable = await isChromeReachable(state.cdpPort, 300);
    if (!reachable) return jsonError(res, 409, "browser not running");
    try {
      const tabs = await listTabs(state.cdpPort);
      const resolved = resolveTargetIdFromTabs(targetId, tabs);
      if (!resolved.ok) {
        if (resolved.reason === "ambiguous") {
          return jsonError(res, 409, "ambiguous target id prefix");
        }
        return jsonError(res, 404, "tab not found");
      }
      await activateTab(state.cdpPort, resolved.targetId);
      res.json({ ok: true });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.delete("/tabs/:targetId", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const targetId = String(req.params.targetId ?? "").trim();
    if (!targetId) return jsonError(res, 400, "targetId is required");
    const reachable = await isChromeReachable(state.cdpPort, 300);
    if (!reachable) return jsonError(res, 409, "browser not running");
    try {
      const tabs = await listTabs(state.cdpPort);
      const resolved = resolveTargetIdFromTabs(targetId, tabs);
      if (!resolved.ok) {
        if (resolved.reason === "ambiguous") {
          return jsonError(res, 409, "ambiguous target id prefix");
        }
        return jsonError(res, 404, "tab not found");
      }
      await closeTab(state.cdpPort, resolved.targetId);
      res.json({ ok: true });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.get("/screenshot", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const targetId =
      typeof req.query.targetId === "string" ? req.query.targetId.trim() : "";
    const fullPage =
      req.query.fullPage === "true" || req.query.fullPage === "1";

    const reachable = await isChromeReachable(state.cdpPort, 300);
    if (!reachable) return jsonError(res, 409, "browser not running");

    try {
      const tabs = await listTabs(state.cdpPort);
      const chosen = targetId
        ? (() => {
            const resolved = resolveTargetIdFromTabs(targetId, tabs);
            if (!resolved.ok) {
              if (resolved.reason === "ambiguous") {
                return "AMBIGUOUS" as const;
              }
              return null;
            }
            return tabs.find((t) => t.targetId === resolved.targetId) ?? null;
          })()
        : (tabs.at(0) ?? null);
      if (chosen === "AMBIGUOUS") {
        return jsonError(res, 409, "ambiguous target id prefix");
      }
      if (!chosen?.wsUrl) return jsonError(res, 404, "tab not found");

      let shot: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let contentTypeHint: "image/jpeg" | "image/png" = "image/jpeg";
      try {
        shot = await captureScreenshot({
          wsUrl: chosen.wsUrl,
          fullPage,
          format: "jpeg",
          quality: 85,
        });
      } catch {
        contentTypeHint = "image/png";
        shot = await captureScreenshotPng({ wsUrl: chosen.wsUrl, fullPage });
      }

      const normalized = await normalizeBrowserScreenshot(shot, {
        maxSide: DEFAULT_BROWSER_SCREENSHOT_MAX_SIDE,
        maxBytes: DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
      });
      await ensureMediaDir();
      const saved = await saveMediaBuffer(
        normalized.buffer,
        normalized.contentType ?? contentTypeHint,
        "browser",
        DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
      );
      const filePath = path.resolve(saved.path);
      res.json({
        ok: true,
        path: filePath,
        targetId: chosen.targetId,
        url: chosen.url,
      });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  function mapTabError(err: unknown) {
    const msg = String(err);
    if (msg.includes("ambiguous target id prefix")) {
      return { status: 409, message: "ambiguous target id prefix" };
    }
    if (msg.includes("tab not found")) {
      return { status: 404, message: "tab not found" };
    }
    return null;
  }

  app.post("/eval", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const js = String((req.body as { js?: unknown })?.js ?? "").trim();
    const targetId = String(
      (req.body as { targetId?: unknown })?.targetId ?? "",
    ).trim();
    const awaitPromise = Boolean((req.body as { await?: unknown })?.await);

    if (!js) return jsonError(res, 400, "js is required");

    try {
      const tab = await ensureTabAvailable(runtime, targetId || undefined);
      const evaluated = await evaluateJavaScript({
        wsUrl: tab.wsUrl ?? "",
        expression: js,
        awaitPromise,
        returnByValue: true,
      });

      if (evaluated.exceptionDetails) {
        const msg =
          evaluated.exceptionDetails.exception?.description ||
          evaluated.exceptionDetails.text ||
          "JavaScript evaluation failed";
        return jsonError(res, 400, msg);
      }

      res.json({
        ok: true,
        targetId: tab.targetId,
        url: tab.url,
        result: evaluated.result,
      });
    } catch (err) {
      const mapped = mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  app.get("/query", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const selector =
      typeof req.query.selector === "string" ? req.query.selector.trim() : "";
    const targetId =
      typeof req.query.targetId === "string" ? req.query.targetId.trim() : "";
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    if (!selector) return jsonError(res, 400, "selector is required");

    try {
      const tab = await ensureTabAvailable(runtime, targetId || undefined);
      const result = await querySelector({
        wsUrl: tab.wsUrl ?? "",
        selector,
        limit,
      });
      res.json({ ok: true, targetId: tab.targetId, url: tab.url, ...result });
    } catch (err) {
      const mapped = mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  app.get("/dom", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const targetId =
      typeof req.query.targetId === "string" ? req.query.targetId.trim() : "";
    const format = req.query.format === "text" ? "text" : "html";
    const selector =
      typeof req.query.selector === "string" ? req.query.selector.trim() : "";
    const maxChars =
      typeof req.query.maxChars === "string"
        ? Number(req.query.maxChars)
        : undefined;

    try {
      const tab = await ensureTabAvailable(runtime, targetId || undefined);
      const result = await getDomText({
        wsUrl: tab.wsUrl ?? "",
        format,
        maxChars,
        selector: selector || undefined,
      });
      res.json({
        ok: true,
        targetId: tab.targetId,
        url: tab.url,
        format,
        ...result,
      });
    } catch (err) {
      const mapped = mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  app.get("/snapshot", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const targetId =
      typeof req.query.targetId === "string" ? req.query.targetId.trim() : "";
    const format =
      req.query.format === "domSnapshot"
        ? "domSnapshot"
        : req.query.format === "ai"
          ? "ai"
          : "aria";
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    try {
      const tab = await ensureTabAvailable(runtime, targetId || undefined);

      if (format === "ai") {
        const snap = await snapshotAiViaPlaywright({
          cdpPort: state.cdpPort,
          targetId: tab.targetId,
        });
        return res.json({
          ok: true,
          format,
          targetId: tab.targetId,
          url: tab.url,
          ...snap,
        });
      }

      if (format === "aria") {
        const snap = await snapshotAria({
          wsUrl: tab.wsUrl ?? "",
          limit,
        });
        return res.json({
          ok: true,
          format,
          targetId: tab.targetId,
          url: tab.url,
          ...snap,
        });
      }

      const snap = await snapshotDom({
        wsUrl: tab.wsUrl ?? "",
        limit,
      });
      return res.json({
        ok: true,
        format,
        targetId: tab.targetId,
        url: tab.url,
        ...snap,
      });
    } catch (err) {
      const mapped = mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  app.post("/click", async (req, res) => {
    if (!state) return jsonError(res, 503, "browser server not started");
    const ref = String((req.body as { ref?: unknown })?.ref ?? "").trim();
    const targetId = String(
      (req.body as { targetId?: unknown })?.targetId ?? "",
    ).trim();

    if (!ref) return jsonError(res, 400, "ref is required");

    try {
      const tab = await ensureTabAvailable(runtime, targetId || undefined);
      await clickRefViaPlaywright({
        cdpPort: state.cdpPort,
        targetId: tab.targetId,
        ref,
      });
      res.json({ ok: true, targetId: tab.targetId, url: tab.url });
    } catch (err) {
      const mapped = mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  const port = resolved.controlPort;
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  }).catch((err) => {
    logError(
      `clawd browser server failed to bind 127.0.0.1:${port}: ${String(err)}`,
    );
    return null;
  });

  if (!server) return null;

  state = {
    server,
    port,
    cdpPort: resolved.cdpPort,
    running: null,
    resolved,
  };

  logInfo(
    `🦞 clawd browser control listening on http://127.0.0.1:${port}/`,
    runtime,
  );
  return state;
}

export async function stopBrowserControlServer(
  runtime: RuntimeEnv = defaultRuntime,
) {
  if (!state) return;
  const current = state;
  state = null;
  try {
    await closePlaywrightBrowserConnection();
    if (current.running) {
      await stopClawdChrome(current.running).catch((err) =>
        logWarn(`clawd browser stop failed: ${String(err)}`, runtime),
      );
    }
  } catch {
    // ignore
  }
  await new Promise<void>((resolve) => current.server.close(() => resolve()));
}
