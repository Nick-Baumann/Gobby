import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { createTargetViaCdp } from "./cdp.js";

describe("cdp", () => {
  let httpServer: ReturnType<typeof createServer> | null = null;
  let wsServer: WebSocketServer | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!httpServer) return resolve();
      httpServer.close(() => resolve());
      httpServer = null;
    });
    await new Promise<void>((resolve) => {
      if (!wsServer) return resolve();
      wsServer.close(() => resolve());
      wsServer = null;
    });
  });

  it("creates a target via the browser websocket", async () => {
    wsServer = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => wsServer?.once("listening", resolve));
    const wsPort = (wsServer.address() as { port: number }).port;

    wsServer.on("connection", (socket) => {
      socket.on("message", (data) => {
        const msg = JSON.parse(String(data)) as {
          id?: number;
          method?: string;
          params?: { url?: string };
        };
        if (msg.method !== "Target.createTarget") return;
        socket.send(
          JSON.stringify({
            id: msg.id,
            result: { targetId: "TARGET_123" },
          }),
        );
      });
    });

    httpServer = createServer((req, res) => {
      if (req.url === "/json/version") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            webSocketDebuggerUrl: `ws://127.0.0.1:${wsPort}/devtools/browser/TEST`,
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    await new Promise<void>((resolve) =>
      httpServer?.listen(0, "127.0.0.1", resolve),
    );
    const httpPort = (httpServer.address() as { port: number }).port;

    const created = await createTargetViaCdp({
      cdpPort: httpPort,
      url: "https://example.com",
    });

    expect(created.targetId).toBe("TARGET_123");
  });
});
