// Minimal browser-friendly stub for @mariozechner/pi-ai
export function getModel(provider, id) {
  return {
    provider,
    id,
    name: id,
    api: `${provider}-messages`,
    input: ["text"],
    output: ["text"],
    maxTokens: 200000,
    reasoning: true,
    headers: undefined,
    baseUrl: undefined,
  };
}

// Dummy stream helpers used in some debug flows; no-ops in web chat.
export function agentLoop() {
  throw new Error("agentLoop is not available in embedded web chat");
}
export class AssistantMessageEventStream {
  push() {}
  end() {}
}
