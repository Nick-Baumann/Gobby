import { beforeEach, describe, expect, it, vi } from "vitest";

import { healthCommand } from "./health.js";

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({ web: {}, inbound: {} }),
}));

vi.mock("../config/sessions.js", () => ({
  resolveStorePath: vi.fn(() => "/tmp/sessions.json"),
  loadSessionStore: vi.fn(() => ({
    "+1555": { updatedAt: Date.now() - 60_000 },
  })),
}));

const waitForWaConnection = vi.fn();
const webAuthExists = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

vi.mock("../web/session.js", () => ({
  createWaSocket: vi.fn(async () => ({
    ws: { close: vi.fn() },
    ev: { on: vi.fn() },
  })),
  waitForWaConnection: (...args: unknown[]) => waitForWaConnection(...args),
  webAuthExists: (...args: unknown[]) => webAuthExists(...args),
  getStatusCode: vi.fn(() => 440),
  getWebAuthAgeMs: () => 5000,
  logWebSelfId: vi.fn(),
}));

vi.mock("../web/reconnect.js", () => ({
  resolveHeartbeatSeconds: () => 60,
}));

describe("healthCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    fetchMock.mockReset();
  });

  it("outputs JSON when linked and connect succeeds", async () => {
    webAuthExists.mockResolvedValue(true);
    waitForWaConnection.mockResolvedValue(undefined);
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: 1, username: "bot" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { url: "https://hook" } }),
      });

    await healthCommand({ json: true, timeoutMs: 5000 }, runtime as never);

    expect(runtime.exit).not.toHaveBeenCalled();
    const logged = runtime.log.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged);
    expect(parsed.web.linked).toBe(true);
    expect(parsed.web.connect.ok).toBe(true);
    expect(parsed.telegram.configured).toBe(true);
    expect(parsed.telegram.probe.ok).toBe(true);
    expect(parsed.sessions.count).toBe(1);
  });

  it("exits non-zero when not linked", async () => {
    webAuthExists.mockResolvedValue(false);
    await healthCommand({ json: true }, runtime as never);
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("exits non-zero when connect fails", async () => {
    webAuthExists.mockResolvedValue(true);
    waitForWaConnection.mockRejectedValueOnce({ output: { statusCode: 440 } });

    await healthCommand({ json: true }, runtime as never);

    expect(runtime.exit).toHaveBeenCalledWith(1);
    const logged = runtime.log.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged);
    expect(parsed.web.connect.ok).toBe(false);
    expect(parsed.web.connect.status).toBe(440);
  });

  it("exits non-zero when telegram probe fails", async () => {
    webAuthExists.mockResolvedValue(true);
    waitForWaConnection.mockResolvedValue(undefined);
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, description: "unauthorized" }),
    });

    await healthCommand({ json: true }, runtime as never);

    expect(runtime.exit).toHaveBeenCalledWith(1);
    const logged = runtime.log.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged);
    expect(parsed.telegram.configured).toBe(true);
    expect(parsed.telegram.probe.ok).toBe(false);
    expect(parsed.telegram.probe.status).toBe(401);
  });
});
