import { getModel, } from "@mariozechner/pi-ai";
// Default transformer: Keep only LLM-compatible messages, strip app-specific fields
function defaultMessageTransformer(messages) {
    return messages
        .filter((m) => {
        // Only keep standard LLM message roles
        return m.role === "user" || m.role === "assistant" || m.role === "toolResult";
    })
        .map((m) => {
        if (m.role === "user") {
            // Strip attachments field (app-specific)
            const { attachments, ...rest } = m;
            return rest;
        }
        return m;
    });
}
export class Agent {
    constructor(opts) {
        this._state = {
            systemPrompt: "",
            model: getModel("google", "gemini-2.5-flash-lite-preview-06-17"),
            thinkingLevel: "off",
            tools: [],
            messages: [],
            isStreaming: false,
            streamMessage: null,
            pendingToolCalls: new Set(),
            error: undefined,
        };
        this.listeners = new Set();
        this.messageQueue = [];
        this._state = { ...this._state, ...opts.initialState };
        this.debugListener = opts.debugListener;
        this.transport = opts.transport;
        this.messageTransformer = opts.messageTransformer || defaultMessageTransformer;
    }
    get state() {
        return this._state;
    }
    subscribe(fn) {
        this.listeners.add(fn);
        fn({ type: "state-update", state: this._state });
        return () => this.listeners.delete(fn);
    }
    // Mutators
    setSystemPrompt(v) {
        this.patch({ systemPrompt: v });
    }
    setModel(m) {
        this.patch({ model: m });
    }
    setThinkingLevel(l) {
        this.patch({ thinkingLevel: l });
    }
    setTools(t) {
        this.patch({ tools: t });
    }
    replaceMessages(ms) {
        this.patch({ messages: ms.slice() });
    }
    appendMessage(m) {
        this.patch({ messages: [...this._state.messages, m] });
    }
    async queueMessage(m) {
        // Transform message and queue it for injection at next turn
        const transformed = await this.messageTransformer([m]);
        this.messageQueue.push({
            original: m,
            llm: transformed[0], // undefined if filtered out
        });
    }
    clearMessages() {
        this.patch({ messages: [] });
    }
    abort() {
        this.abortController?.abort();
    }
    logState(message) {
        const { systemPrompt, model, messages } = this._state;
        console.log(message, { systemPrompt, model, messages });
    }
    async prompt(input, attachments, opts) {
        const model = this._state.model;
        if (!model) {
            this.emit({ type: "error-no-model" });
            return;
        }
        // Build user message with attachments
        const content = [{ type: "text", text: input }];
        if (attachments?.length) {
            for (const a of attachments) {
                if (a.type === "image") {
                    content.push({ type: "image", data: a.content, mimeType: a.mimeType });
                }
                else if (a.type === "document" && a.extractedText) {
                    content.push({
                        type: "text",
                        text: `\n\n[Document: ${a.fileName}]\n${a.extractedText}`,
                        isDocument: true,
                    });
                }
            }
        }
        const userMessage = {
            role: "user",
            content,
            attachments: attachments?.length ? attachments : undefined,
            timestamp: Date.now(),
        };
        this.abortController = new AbortController();
        this.patch({ isStreaming: true, streamMessage: null, error: undefined });
        this.emit({ type: "started" });
        const thinkingLevel = (opts?.thinkingOverride ?? this._state.thinkingLevel) ?? "off";
        const reasoning = thinkingLevel === "off"
            ? undefined
            : thinkingLevel === "minimal"
                ? "low"
                : thinkingLevel;
        const shouldSendOverride = opts?.transient === true;
        const cfg = {
            systemPrompt: this._state.systemPrompt,
            tools: this._state.tools,
            model,
            reasoning,
            thinkingOverride: shouldSendOverride ? thinkingLevel : undefined,
            thinkingOnce: shouldSendOverride ? thinkingLevel : undefined,
            getQueuedMessages: async () => {
                // Return queued messages (they'll be added to state via message_end event)
                const queued = this.messageQueue.slice();
                this.messageQueue = [];
                return queued;
            },
        };
        try {
            let partial = null;
            let turnDebug = null;
            let turnStart = 0;
            this.logState("prompt started, current state:");
            // Transform app messages to LLM-compatible messages (initial set)
            const llmMessages = await this.messageTransformer(this._state.messages);
            console.log("transformed messages:", llmMessages);
            for await (const ev of this.transport.run(llmMessages, userMessage, cfg, this.abortController.signal)) {
                switch (ev.type) {
                    case "turn_start": {
                        turnStart = performance.now();
                        // Build request context snapshot (use transformed messages)
                        const ctx = {
                            systemPrompt: this._state.systemPrompt,
                            messages: [...llmMessages],
                            tools: this._state.tools,
                        };
                        turnDebug = {
                            timestamp: new Date().toISOString(),
                            request: {
                                provider: cfg.model.provider,
                                model: cfg.model.id,
                                context: { ...ctx },
                            },
                            sseEvents: [],
                        };
                        break;
                    }
                    case "message_start":
                    case "message_update": {
                        partial = ev.message;
                        // Collect SSE-like events for debug (drop heavy partial)
                        if (ev.type === "message_update" && ev.assistantMessageEvent && turnDebug) {
                            const copy = { ...ev.assistantMessageEvent };
                            if (copy && "partial" in copy)
                                delete copy.partial;
                            turnDebug.sseEvents.push(JSON.stringify(copy));
                            if (!turnDebug.ttft)
                                turnDebug.ttft = performance.now() - turnStart;
                        }
                        this.patch({ streamMessage: ev.message });
                        break;
                    }
                    case "message_end": {
                        partial = null;
                        this.appendMessage(ev.message);
                        this.patch({ streamMessage: null });
                        if (turnDebug) {
                            if (ev.message.role !== "assistant" && ev.message.role !== "toolResult") {
                                turnDebug.request.context.messages.push(ev.message);
                            }
                            if (ev.message.role === "assistant")
                                turnDebug.response = ev.message;
                        }
                        break;
                    }
                    case "tool_execution_start": {
                        const s = new Set(this._state.pendingToolCalls);
                        s.add(ev.toolCallId);
                        this.patch({ pendingToolCalls: s });
                        break;
                    }
                    case "tool_execution_end": {
                        const s = new Set(this._state.pendingToolCalls);
                        s.delete(ev.toolCallId);
                        this.patch({ pendingToolCalls: s });
                        break;
                    }
                    case "turn_end": {
                        // finalize current turn
                        if (turnDebug) {
                            turnDebug.totalTime = performance.now() - turnStart;
                            this.debugListener?.(turnDebug);
                            turnDebug = null;
                        }
                        break;
                    }
                    case "agent_end": {
                        this.patch({ streamMessage: null });
                        break;
                    }
                }
            }
            if (partial && partial.role === "assistant" && partial.content.length > 0) {
                const onlyEmpty = !partial.content.some((c) => (c.type === "thinking" && c.thinking.trim().length > 0) ||
                    (c.type === "text" && c.text.trim().length > 0) ||
                    (c.type === "toolCall" && c.name.trim().length > 0));
                if (!onlyEmpty) {
                    this.appendMessage(partial);
                }
                else {
                    if (this.abortController?.signal.aborted) {
                        throw new Error("Request was aborted");
                    }
                }
            }
        }
        catch (err) {
            if (String(err?.message || err) === "no-api-key") {
                this.emit({ type: "error-no-api-key", provider: model.provider });
            }
            else {
                const msg = {
                    role: "assistant",
                    content: [{ type: "text", text: "" }],
                    api: model.api,
                    provider: model.provider,
                    model: model.id,
                    usage: {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                    },
                    stopReason: this.abortController?.signal.aborted ? "aborted" : "error",
                    errorMessage: err?.message || String(err),
                    timestamp: Date.now(),
                };
                this.appendMessage(msg);
                this.patch({ error: err?.message || String(err) });
            }
        }
        finally {
            this.patch({ isStreaming: false, streamMessage: null, pendingToolCalls: new Set() });
            this.abortController = undefined;
            this.emit({ type: "completed" });
        }
        this.logState("final state:");
    }
    patch(p) {
        this._state = { ...this._state, ...p };
        this.emit({ type: "state-update", state: this._state });
    }
    emit(e) {
        for (const listener of this.listeners) {
            listener(e);
        }
    }
}
//# sourceMappingURL=agent.js.map
