export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: "job" | "tool" | string;
  ts: number;
  data: Record<string, unknown>;
};

let seq = 0;
const listeners = new Set<(evt: AgentEventPayload) => void>();

export function emitAgentEvent(event: Omit<AgentEventPayload, "seq" | "ts">) {
  const enriched: AgentEventPayload = {
    ...event,
    seq: ++seq,
    ts: Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch {
      /* ignore */
    }
  }
}

export function onAgentEvent(listener: (evt: AgentEventPayload) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

