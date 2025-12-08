var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ModelSelector } from "../dialogs/ModelSelector.js";
import "./MessageEditor.js";
import "./MessageList.js";
import "./Messages.js"; // Import for side effects to register the custom elements
import { getAppStorage } from "../storage/app-storage.js";
import "./StreamingMessageContainer.js";
import { formatUsage } from "../utils/format.js";
import { i18n } from "../utils/i18n.js";
let AgentInterface = class AgentInterface extends LitElement {
    constructor() {
        super(...arguments);
        this.enableAttachments = true;
        this.enableModelSelector = true;
        this.enableThinkingSelector = true;
        this.showThemeToggle = false;
        this.sessionThinkingLevel = "off";
        this.pendingThinkingLevel = null;
        this._autoScroll = true;
        this._lastScrollTop = 0;
        this._lastClientHeight = 0;
        this._handleScroll = (_ev) => {
            if (!this._scrollContainer)
                return;
            const currentScrollTop = this._scrollContainer.scrollTop;
            const scrollHeight = this._scrollContainer.scrollHeight;
            const clientHeight = this._scrollContainer.clientHeight;
            const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
            // Ignore relayout due to message editor getting pushed up by stats
            if (clientHeight < this._lastClientHeight) {
                this._lastClientHeight = clientHeight;
                return;
            }
            // Only disable auto-scroll if user scrolled UP or is far from bottom
            if (currentScrollTop !== 0 && currentScrollTop < this._lastScrollTop && distanceFromBottom > 50) {
                this._autoScroll = false;
            }
            else if (distanceFromBottom < 10) {
                // Re-enable if very close to bottom
                this._autoScroll = true;
            }
            this._lastScrollTop = currentScrollTop;
            this._lastClientHeight = clientHeight;
        };
    }
    setInput(text, attachments) {
        const update = () => {
            if (!this._messageEditor)
                requestAnimationFrame(update);
            else {
                this._messageEditor.value = text;
                this._messageEditor.attachments = attachments || [];
            }
        };
        update();
    }
    setAutoScroll(enabled) {
        this._autoScroll = enabled;
    }
    createRenderRoot() {
        return this;
    }
    willUpdate(changedProperties) {
        super.willUpdate(changedProperties);
        // Re-subscribe when session property changes
        if (changedProperties.has("session")) {
            this.setupSessionSubscription();
        }
    }
    async connectedCallback() {
        super.connectedCallback();
        this.style.display = "flex";
        this.style.flexDirection = "column";
        this.style.height = "100%";
        this.style.minHeight = "0";
        // Wait for first render to get scroll container
        await this.updateComplete;
        this._scrollContainer = this.querySelector(".overflow-y-auto");
        if (this._scrollContainer) {
            // Set up ResizeObserver to detect content changes
            this._resizeObserver = new ResizeObserver(() => {
                if (this._autoScroll && this._scrollContainer) {
                    this._scrollContainer.scrollTop = this._scrollContainer.scrollHeight;
                }
            });
            // Observe the content container inside the scroll container
            const contentContainer = this._scrollContainer.querySelector(".max-w-3xl");
            if (contentContainer) {
                this._resizeObserver.observe(contentContainer);
            }
            // Set up scroll listener with better detection
            this._scrollContainer.addEventListener("scroll", this._handleScroll);
        }
        // Subscribe to external session if provided
        this.setupSessionSubscription();
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        // Clean up observers and listeners
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = undefined;
        }
        if (this._scrollContainer) {
            this._scrollContainer.removeEventListener("scroll", this._handleScroll);
        }
        if (this._unsubscribeSession) {
            this._unsubscribeSession();
            this._unsubscribeSession = undefined;
        }
    }
    setupSessionSubscription() {
        if (this._unsubscribeSession) {
            this._unsubscribeSession();
            this._unsubscribeSession = undefined;
        }
        if (!this.session)
            return;
            this._unsubscribeSession = this.session.subscribe(async (ev) => {
                if (ev.type === "state-update") {
                    if (this.pendingThinkingLevel === null && ev.state.thinkingLevel) {
                        this.sessionThinkingLevel = ev.state.thinkingLevel;
                    }
                    if (this._streamingContainer) {
                        this._streamingContainer.isStreaming = ev.state.isStreaming;
                        this._streamingContainer.setMessage(ev.state.streamMessage, !ev.state.isStreaming);
                    }
                    this.requestUpdate();
            }
            else if (ev.type === "error-no-model") {
                // TODO show some UI feedback
            }
            else if (ev.type === "error-no-api-key") {
                // Handled by onApiKeyRequired callback
            }
        });
    }
    async sendMessage(input, attachments) {
        if ((!input.trim() && attachments?.length === 0) || this.session?.state.isStreaming)
            return;
        const session = this.session;
        if (!session)
            throw new Error("No session set on AgentInterface");
        if (!session.state.model)
            throw new Error("No model set on AgentInterface");
        // Check if API key exists for the provider (only needed in direct mode)
        const provider = session.state.model.provider;
        const apiKey = await getAppStorage().providerKeys.get(provider);
        // If no API key, prompt for it
        if (!apiKey) {
            if (!this.onApiKeyRequired) {
                console.error("No API key configured and no onApiKeyRequired handler set");
                return;
            }
            const success = await this.onApiKeyRequired(provider);
            // If still no API key, abort the send
            if (!success) {
                return;
            }
        }
        // Call onBeforeSend hook before sending
        if (this.onBeforeSend) {
            await this.onBeforeSend();
        }
        const baseThinking =
            this.sessionThinkingLevel || session.state.thinkingLevel || "off";
        const thinkingOverride = this.pendingThinkingLevel ?? baseThinking;
        const transient =
            this.pendingThinkingLevel !== null &&
            this.pendingThinkingLevel !== baseThinking;
        // Only clear editor after we know we can send
        this._messageEditor.value = "";
        this._messageEditor.attachments = [];
        this._autoScroll = true; // Enable auto-scroll when sending a message
        await this.session?.prompt(input, attachments, {
            thinkingOverride,
            transient,
        });
        this.pendingThinkingLevel = null;
        // Reset editor thinking selector to session baseline
        if (this._messageEditor) {
            this._messageEditor.thinkingLevel = this.sessionThinkingLevel || "off";
        }
    }
    renderMessages() {
        if (!this.session)
            return html `<div class="p-4 text-center text-muted-foreground">${i18n("No session available")}</div>`;
        const state = this.session.state;
        // Build a map of tool results to allow inline rendering in assistant messages
        const toolResultsById = new Map();
        for (const message of state.messages) {
            if (message.role === "toolResult") {
                toolResultsById.set(message.toolCallId, message);
            }
        }
        return html `
			<div class="flex flex-col gap-3">
				<!-- Stable messages list - won't re-render during streaming -->
				<message-list
					.messages=${this.session.state.messages}
					.tools=${state.tools}
					.pendingToolCalls=${this.session ? this.session.state.pendingToolCalls : new Set()}
					.isStreaming=${state.isStreaming}
					.onCostClick=${this.onCostClick}
				></message-list>

				<!-- Streaming message container - manages its own updates -->
				<streaming-message-container
					class="${state.isStreaming ? "" : "hidden"}"
					.tools=${state.tools}
					.isStreaming=${state.isStreaming}
					.pendingToolCalls=${state.pendingToolCalls}
					.toolResultsById=${toolResultsById}
					.onCostClick=${this.onCostClick}
				></streaming-message-container>
			</div>
		`;
    }
    renderStats() {
        if (!this.session)
            return html `<div class="text-xs h-5"></div>`;
        const state = this.session.state;
        const totals = state.messages
            .filter((m) => m.role === "assistant")
            .reduce((acc, msg) => {
            const usage = msg.usage;
            if (usage) {
                acc.input += usage.input;
                acc.output += usage.output;
                acc.cacheRead += usage.cacheRead;
                acc.cacheWrite += usage.cacheWrite;
                acc.cost.total += usage.cost.total;
            }
            return acc;
        }, {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        });
        const hasTotals = totals.input || totals.output || totals.cacheRead || totals.cacheWrite;
        const totalsText = hasTotals ? formatUsage(totals) : "";
        return html `
			<div class="text-xs text-muted-foreground flex justify-between items-center h-5">
				<div class="flex items-center gap-1">
					${this.showThemeToggle ? html `<theme-toggle></theme-toggle>` : html ``}
				</div>
				<div class="flex ml-auto items-center gap-3">
					${totalsText
            ? this.onCostClick
                ? html `<span class="cursor-pointer hover:text-foreground transition-colors" @click=${this.onCostClick}>${totalsText}</span>`
                : html `<span>${totalsText}</span>`
            : ""}
				</div>
			</div>
		`;
    }
    render() {
        if (!this.session)
            return html `<div class="p-4 text-center text-muted-foreground">${i18n("No session set")}</div>`;
        const session = this.session;
        const state = this.session.state;
        return html `
			<div class="flex flex-col h-full bg-background text-foreground">
				<!-- Messages Area -->
				<div class="flex-1 overflow-y-auto">
					<div class="max-w-3xl mx-auto p-4 pb-0">${this.renderMessages()}</div>
				</div>

				<!-- Input Area -->
				<div class="shrink-0">
					<div class="max-w-3xl mx-auto px-2">
						<message-editor
							.isStreaming=${state.isStreaming}
                            .currentModel=${state.model}
                            .thinkingLevel=${this.pendingThinkingLevel ?? this.sessionThinkingLevel ?? state.thinkingLevel}
                            .showAttachmentButton=${this.enableAttachments}
                            .showModelSelector=${this.enableModelSelector}
                            .showThinkingSelector=${this.enableThinkingSelector}
                            .onSend=${(input, attachments) => {
            this.sendMessage(input, attachments);
        }}
							.onAbort=${() => session.abort()}
							.onModelSelect=${() => {
            ModelSelector.open(state.model, (model) => session.setModel(model));
        }}
							.onThinkingChange=${this.enableThinkingSelector
            ? (level) => {
                this.pendingThinkingLevel = level;
                if (this._messageEditor) {
                    this._messageEditor.thinkingLevel = level;
                }
                this.requestUpdate();
            }
            : undefined}
						></message-editor>
						${this.renderStats()}
					</div>
				</div>
			</div>
		`;
    }
};
__decorate([
    property({ attribute: false })
], AgentInterface.prototype, "session", void 0);
__decorate([
    property({ type: Boolean })
], AgentInterface.prototype, "enableAttachments", void 0);
__decorate([
    property({ type: Boolean })
], AgentInterface.prototype, "enableModelSelector", void 0);
__decorate([
    property({ type: Boolean })
], AgentInterface.prototype, "enableThinkingSelector", void 0);
__decorate([
    property({ type: String })
], AgentInterface.prototype, "sessionThinkingLevel", void 0);
__decorate([
    property({ type: Boolean })
], AgentInterface.prototype, "showThemeToggle", void 0);
__decorate([
    property({ attribute: false })
], AgentInterface.prototype, "onApiKeyRequired", void 0);
__decorate([
    property({ attribute: false })
], AgentInterface.prototype, "onBeforeSend", void 0);
__decorate([
    property({ attribute: false })
], AgentInterface.prototype, "onBeforeToolCall", void 0);
__decorate([
    property({ attribute: false })
], AgentInterface.prototype, "onCostClick", void 0);
__decorate([
    query("message-editor")
], AgentInterface.prototype, "_messageEditor", void 0);
__decorate([
    query("streaming-message-container")
], AgentInterface.prototype, "_streamingContainer", void 0);
__decorate([
    state()
], AgentInterface.prototype, "pendingThinkingLevel", void 0);
AgentInterface = __decorate([
    customElement("agent-interface")
], AgentInterface);
export { AgentInterface };
// Register custom element with guard
if (!customElements.get("agent-interface")) {
    customElements.define("agent-interface", AgentInterface);
}
//# sourceMappingURL=AgentInterface.js.map
