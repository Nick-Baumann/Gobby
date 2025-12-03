import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import readline from "node:readline";

import { piSpec } from "../agents/pi.js";

type TauRpcOptions = {
  argv: string[];
  cwd?: string;
  timeoutMs: number;
  onEvent?: (line: string) => void;
};

type TauRpcResult = {
  stdout: string;
  stderr: string;
  code: number;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
};

class TauRpcClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private stderr = "";
  private buffer: string[] = [];
  private idleTimer: NodeJS.Timeout | null = null;
  private sawToolActivity = false;
  private seenAssistantEnd = false;
  private seenAgentEnd = false;
  private readonly idleMs = 120;
  private pending:
    | {
        resolve: (r: TauRpcResult) => void;
        reject: (err: unknown) => void;
        timer: NodeJS.Timeout;
        onEvent?: (line: string) => void;
      }
    | undefined;

  constructor(
    private readonly argv: string[],
    private readonly cwd: string | undefined,
  ) {}

  private ensureChild() {
    if (this.child) return;
    this.child = spawn(this.argv[0], this.argv.slice(1), {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (d) => {
      this.stderr += d.toString();
    });
    this.child.on("exit", (code, signal) => {
      if (this.pending) {
        this.pending.reject(
          new Error(`tau rpc exited (code=${code}, signal=${signal})`),
        );
        clearTimeout(this.pending.timer);
        this.pending = undefined;
      }
      this.dispose();
    });
  }

  private handleLine(line: string) {
    if (!this.pending) return;
    this.buffer.push(line);
    this.pending?.onEvent?.(line);

    // Parse the line once to track agent/tool lifecycle signals.
    try {
      const evt = JSON.parse(line) as { type?: string; message?: unknown };

      // Any tool activity (calls or execution events) means we should wait for agent_end,
      // not the first assistant message_end, to avoid truncating follow-up replies.
      if (
        evt?.type === "tool_execution_start" ||
        evt?.type === "tool_execution_end" ||
        (evt?.type === "message" &&
          evt.message &&
          JSON.stringify(evt.message).includes('"toolCall"'))
      ) {
        this.sawToolActivity = true;
      }

      if (evt?.type === "agent_end") {
        this.seenAgentEnd = true;
        if (this.idleTimer) clearTimeout(this.idleTimer);
        const pending = this.pending;
        this.pending = undefined;
        const out = this.buffer.join("\n");
        this.buffer = [];
        this.sawToolActivity = false;
        this.seenAssistantEnd = false;
        clearTimeout(pending.timer);
        pending.resolve({ stdout: out, stderr: this.stderr, code: 0 });
        return;
      }
    } catch {
      // ignore malformed/non-JSON lines
    }

    // Streamed JSON arrives line-by-line; mark when an assistant message finishes
    // and resolve after a short idle to capture any follow-up events (e.g. tools)
    // that belong to the same turn.
    if (
      line.includes('"type":"message_end"') &&
      line.includes('"role":"assistant"')
    ) {
      this.seenAssistantEnd = true;
    }

    if (this.seenAssistantEnd) {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (!this.pending) return;
        const out = this.buffer.join("\n");
        // If tools are in-flight, prefer waiting for agent_end to avoid dropping the
        // post-tool assistant turn. The outer timeout still prevents hangs.
        if (this.sawToolActivity && !this.seenAgentEnd) {
          return;
        }
        // Only resolve once we have at least one assistant text payload; otherwise keep waiting.
        const parsed = piSpec.parseOutput(out);
        if (parsed.texts && parsed.texts.length > 0) {
          const pending = this.pending;
          this.pending = undefined;
          this.buffer = [];
          this.sawToolActivity = false;
          this.seenAssistantEnd = false;
          clearTimeout(pending.timer);
          pending.resolve({ stdout: out, stderr: this.stderr, code: 0 });
          return;
        }
        // No assistant text yet; wait for more lines.
      }, this.idleMs); // small idle window to group streaming blocks
    }
  }

  async prompt(
    prompt: string,
    timeoutMs: number,
    onEvent?: (line: string) => void,
  ): Promise<TauRpcResult> {
    this.ensureChild();
    if (this.pending) {
      throw new Error("tau rpc already handling a request");
    }
    const child = this.child;
    if (!child) throw new Error("tau rpc child not initialized");
    await new Promise<void>((resolve, reject) => {
      const ok = child.stdin.write(
        `${JSON.stringify({
          type: "prompt",
          message: { role: "user", content: [{ type: "text", text: prompt }] },
        })}\n`,
        (err) => (err ? reject(err) : resolve()),
      );
      if (!ok) child.stdin.once("drain", () => resolve());
    });
    return await new Promise<TauRpcResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.sawToolActivity = false;
        this.seenAssistantEnd = false;
        this.seenAgentEnd = false;
        reject(new Error(`tau rpc timed out after ${timeoutMs}ms`));
        child.kill("SIGKILL");
      }, timeoutMs);
      this.pending = { resolve, reject, timer, onEvent };
    });
  }

  dispose() {
    this.rl?.close();
    this.rl = null;
    if (this.child && !this.child.killed) {
      this.child.kill("SIGKILL");
    }
    this.child = null;
    this.buffer = [];
    this.stderr = "";
  }
}

let singleton: { key: string; client: TauRpcClient } | undefined;

export async function runPiRpc(
  opts: TauRpcOptions & { prompt: string },
): Promise<TauRpcResult> {
  const key = `${opts.cwd ?? ""}|${opts.argv.join(" ")}`;
  if (!singleton || singleton.key !== key) {
    singleton?.client.dispose();
    singleton = { key, client: new TauRpcClient(opts.argv, opts.cwd) };
  }
  return singleton.client.prompt(opts.prompt, opts.timeoutMs, opts.onEvent);
}

export function resetPiRpc() {
  singleton?.client.dispose();
  singleton = undefined;
}
