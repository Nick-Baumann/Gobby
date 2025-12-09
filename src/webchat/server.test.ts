import { describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import {
  startWebChatServer,
  stopWebChatServer,
  __forceWebChatSnapshotForTests,
  __broadcastGatewayEventForTests,
} from "./server.js";

async function getFreePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port as number;
      server.close((err: Error | null) => (err ? reject(err) : resolve(port)));
    });
  });
}

function onceMessage<T = any>(ws: WebSocket, filter: (obj: any) => boolean, timeoutMs = 8000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const closeHandler = (code: number, reason: Buffer) => {
      clearTimeout(timer);
      ws.off("message", handler);
      reject(new Error(`closed ${code}: ${reason.toString()}`));
    };
    const handler = (data: WebSocket.RawData) => {
      const obj = JSON.parse(String(data));
      if (filter(obj)) {
        clearTimeout(timer);
        ws.off("message", handler);
        ws.off("close", closeHandler);
        resolve(obj as T);
      }
    };
    ws.on("message", handler);
    ws.once("close", closeHandler);
  });
}

describe("webchat server", () => {
  test("hydrates snapshot to new sockets (offline mock)", { timeout: 8000 }, async () => {
    const wPort = await getFreePort();
    await startWebChatServer(wPort, undefined, { disableGateway: true });
    const ws = new WebSocket(`ws://127.0.0.1:${wPort}/webchat/socket?session=test`);
    const messages: any[] = [];
    ws.on("message", (data) => {
      try {
        messages.push(JSON.parse(String(data)));
      } catch {
        /* ignore */
      }
    });

    try {
      await new Promise<void>((resolve) => ws.once("open", resolve));

      __forceWebChatSnapshotForTests({
        presence: [],
        health: {},
        stateVersion: { presence: 1, health: 1 },
        uptimeMs: 0,
      });

      const waitFor = async (pred: (m: any) => boolean, label: string) => {
        const start = Date.now();
        while (Date.now() - start < 3000) {
          const found = messages.find((m) => {
            try {
              return pred(m);
            } catch {
              return false;
            }
          });
          if (found) return found;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`timeout waiting for ${label}`);
      };

      await waitFor((m) => m?.type === "session", "session");
      const snap = await waitFor((m) => m?.type === "gateway-snapshot", "snapshot");
      expect(snap.snapshot?.stateVersion?.presence).toBe(1);
    } finally {
      ws.close();
      await stopWebChatServer();
    }
  });
});
