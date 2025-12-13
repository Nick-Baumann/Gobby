import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { approveNodePairing, listNodePairing } from "../node-pairing.js";
import { startNodeBridgeServer } from "./server.js";

function createLineReader(socket: net.Socket) {
  let buffer = "";
  const pending: Array<(line: string) => void> = [];

  const flush = () => {
    while (pending.length > 0) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) return;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const resolve = pending.shift();
      resolve?.(line);
    }
  };

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flush();
  });

  const readLine = async () => {
    flush();
    const idx = buffer.indexOf("\n");
    if (idx !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      return line;
    }
    return await new Promise<string>((resolve) => pending.push(resolve));
  };

  return readLine;
}

function sendLine(socket: net.Socket, obj: unknown) {
  socket.write(`${JSON.stringify(obj)}\n`);
}

describe("node bridge server", () => {
  let baseDir = "";

  beforeAll(async () => {
    process.env.CLAWDIS_ENABLE_BRIDGE_IN_TESTS = "1";
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdis-bridge-test-"));
  });

  afterAll(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
    delete process.env.CLAWDIS_ENABLE_BRIDGE_IN_TESTS;
  });

  it("rejects hello when not paired", async () => {
    const server = await startNodeBridgeServer({
      host: "127.0.0.1",
      port: 0,
      pairingBaseDir: baseDir,
    });

    const socket = net.connect({ host: "127.0.0.1", port: server.port });
    const readLine = createLineReader(socket);
    sendLine(socket, { type: "hello", nodeId: "n1" });
    const line = await readLine();
    const msg = JSON.parse(line) as { type: string; code?: string };
    expect(msg.type).toBe("error");
    expect(msg.code).toBe("NOT_PAIRED");
    socket.destroy();
    await server.close();
  });

  it("pairs after approval and then accepts hello", async () => {
    const server = await startNodeBridgeServer({
      host: "127.0.0.1",
      port: 0,
      pairingBaseDir: baseDir,
    });

    const socket = net.connect({ host: "127.0.0.1", port: server.port });
    const readLine = createLineReader(socket);
    sendLine(socket, { type: "pair-request", nodeId: "n2", platform: "ios" });

    // Approve the pending request from the gateway side.
    let reqId: string | undefined;
    for (let i = 0; i < 40; i += 1) {
      const list = await listNodePairing(baseDir);
      const req = list.pending.find((p) => p.nodeId === "n2");
      if (req) {
        reqId = req.requestId;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(reqId).toBeTruthy();
    if (!reqId) throw new Error("expected a pending requestId");
    await approveNodePairing(reqId, baseDir);

    const line1 = JSON.parse(await readLine()) as {
      type: string;
      token?: string;
    };
    expect(line1.type).toBe("pair-ok");
    expect(typeof line1.token).toBe("string");
    if (!line1.token) throw new Error("expected pair-ok token");
    const token = line1.token;

    const line2 = JSON.parse(await readLine()) as { type: string };
    expect(line2.type).toBe("hello-ok");

    socket.destroy();

    const socket2 = net.connect({ host: "127.0.0.1", port: server.port });
    const readLine2 = createLineReader(socket2);
    sendLine(socket2, { type: "hello", nodeId: "n2", token });
    const line3 = JSON.parse(await readLine2()) as { type: string };
    expect(line3.type).toBe("hello-ok");
    socket2.destroy();

    await server.close();
  });
});
