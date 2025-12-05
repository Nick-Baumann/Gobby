import { describe, expect, it, vi } from "vitest";

import { getReplyFromConfig } from "./reply.js";

const baseCfg = {
  inbound: {
    reply: {
      mode: "command" as const,
      command: ["echo", "{{Body}}"],
      session: undefined,
    },
  },
};

describe("trigger handling", () => {
  it("aborts even with timestamp prefix", async () => {
    const runner = vi.fn();
    const res = await getReplyFromConfig(
      {
        Body: "[Dec 5 10:00] stop",
        From: "+1000",
        To: "+2000",
      },
      {},
      baseCfg,
      runner,
    );
    const text = Array.isArray(res) ? res[0]?.text : res?.text;
    expect(text).toBe("⚙️ Agent was aborted.");
    expect(runner).not.toHaveBeenCalled();
  });

  it("restarts even with prefix/whitespace", async () => {
    const runner = vi.fn();
    const res = await getReplyFromConfig(
      {
        Body: "  [Dec 5] /restart",
        From: "+1001",
        To: "+2000",
      },
      {},
      baseCfg,
      runner,
    );
    const text = Array.isArray(res) ? res[0]?.text : res?.text;
    expect(text?.startsWith("⚙️ Restarting" ?? "")).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });
});
