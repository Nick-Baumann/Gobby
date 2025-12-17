import fs from "node:fs/promises";
import path from "node:path";

import {
  Agent,
  type AgentEvent,
  type AppMessage,
  ProviderTransport,
  type ThinkingLevel,
} from "@mariozechner/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  getApiKey,
  getModels,
  getProviders,
  type KnownProvider,
  type Model,
} from "@mariozechner/pi-ai";
import {
  AgentSession,
  codingTools,
  messageTransformer,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ThinkLevel, VerboseLevel } from "../auto-reply/thinking.js";
import {
  createToolDebouncer,
  formatToolAggregate,
} from "../auto-reply/tool-meta.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { splitMediaFromOutput } from "../media/parse.js";
import { enqueueCommand } from "../process/command-queue.js";
import { resolveUserPath } from "../utils.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./defaults.js";
import { getAnthropicOAuthToken } from "./pi-oauth.js";
import { buildAgentSystemPrompt } from "./system-prompt.js";
import { loadWorkspaceBootstrapFiles } from "./workspace.js";

export type EmbeddedPiAgentMeta = {
  sessionId: string;
  provider: string;
  model: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
};

export type EmbeddedPiRunMeta = {
  durationMs: number;
  agentMeta?: EmbeddedPiAgentMeta;
  aborted?: boolean;
};

export type EmbeddedPiRunResult = {
  payloads?: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
  }>;
  meta: EmbeddedPiRunMeta;
};

function mapThinkingLevel(level?: ThinkLevel): ThinkingLevel {
  // pi-agent-core supports "xhigh" too; Clawdis doesn't surface it for now.
  if (!level) return "off";
  return level;
}

function isKnownProvider(provider: string): provider is KnownProvider {
  return getProviders().includes(provider as KnownProvider);
}

function resolveModel(
  provider: string,
  modelId: string,
): Model<Api> | undefined {
  if (!isKnownProvider(provider)) return undefined;
  const models = getModels(provider);
  const model = models.find((m) => m.id === modelId);
  return model as Model<Api> | undefined;
}

function extractAssistantText(msg: AssistantMessage): string {
  const isTextBlock = (
    block: unknown,
  ): block is { type: "text"; text: string } => {
    if (!block || typeof block !== "object") return false;
    const rec = block as Record<string, unknown>;
    return rec.type === "text" && typeof rec.text === "string";
  };

  const blocks = Array.isArray(msg.content)
    ? msg.content
        .filter(isTextBlock)
        .map((c) => c.text.trim())
        .filter(Boolean)
    : [];
  return blocks.join("\n").trim();
}

function inferToolMetaFromArgs(
  toolName: string,
  args: unknown,
): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;

  const p = typeof record.path === "string" ? record.path : undefined;
  const command =
    typeof record.command === "string" ? record.command : undefined;

  if (toolName === "read" && p) {
    const offset =
      typeof record.offset === "number" ? record.offset : undefined;
    const limit = typeof record.limit === "number" ? record.limit : undefined;
    if (offset !== undefined && limit !== undefined) {
      return `${p}:${offset}-${offset + limit}`;
    }
    return p;
  }
  if ((toolName === "edit" || toolName === "write") && p) return p;
  if (toolName === "bash" && command) return command;
  return p ?? command;
}

async function ensureSessionHeader(params: {
  sessionFile: string;
  sessionId: string;
  cwd: string;
  provider: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
}) {
  const file = params.sessionFile;
  try {
    await fs.stat(file);
    return;
  } catch {
    // create
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const entry = {
    type: "session",
    id: params.sessionId,
    timestamp: new Date().toISOString(),
    cwd: params.cwd,
    provider: params.provider,
    modelId: params.modelId,
    thinkingLevel: params.thinkingLevel,
  };
  await fs.writeFile(file, `${JSON.stringify(entry)}\n`, "utf-8");
}

async function getApiKeyForProvider(
  provider: string,
): Promise<string | undefined> {
  if (provider === "anthropic") {
    const oauthToken = await getAnthropicOAuthToken();
    if (oauthToken) return oauthToken;
    const oauthEnv = process.env.ANTHROPIC_OAUTH_TOKEN;
    if (oauthEnv?.trim()) return oauthEnv.trim();
  }
  return getApiKey(provider) ?? undefined;
}

export async function runEmbeddedPiAgent(params: {
  sessionId: string;
  sessionFile: string;
  workspaceDir: string;
  prompt: string;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  verboseLevel?: VerboseLevel;
  timeoutMs: number;
  runId: string;
  onPartialReply?: (payload: {
    text?: string;
    mediaUrls?: string[];
  }) => void | Promise<void>;
  onAgentEvent?: (evt: {
    stream: string;
    data: Record<string, unknown>;
  }) => void;
  enqueue?: typeof enqueueCommand;
}): Promise<EmbeddedPiRunResult> {
  const enqueue = params.enqueue ?? enqueueCommand;
  return enqueue(async () => {
    const started = Date.now();
    const resolvedWorkspace = resolveUserPath(params.workspaceDir);
    const prevCwd = process.cwd();

    const provider =
      (params.provider ?? DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER;
    const modelId = (params.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const model = resolveModel(provider, modelId);
    if (!model) {
      throw new Error(`Unknown model: ${provider}/${modelId}`);
    }

    const thinkingLevel = mapThinkingLevel(params.thinkLevel);

    await fs.mkdir(resolvedWorkspace, { recursive: true });
    await ensureSessionHeader({
      sessionFile: params.sessionFile,
      sessionId: params.sessionId,
      cwd: resolvedWorkspace,
      provider,
      modelId,
      thinkingLevel,
    });

    process.chdir(resolvedWorkspace);
    try {
      const bootstrapFiles =
        await loadWorkspaceBootstrapFiles(resolvedWorkspace);
      const systemPrompt = buildAgentSystemPrompt({
        workspaceDir: resolvedWorkspace,
        bootstrapFiles: bootstrapFiles.map((f) => ({
          name: f.name,
          path: f.path,
          content: f.content,
          missing: f.missing,
        })),
        defaultThinkLevel: params.thinkLevel,
      });

      const sessionManager = new SessionManager(false, params.sessionFile);
      const settingsManager = new SettingsManager();

      const agent = new Agent({
        initialState: {
          systemPrompt,
          model,
          thinkingLevel,
          tools: codingTools,
        },
        messageTransformer,
        queueMode: settingsManager.getQueueMode(),
        transport: new ProviderTransport({
          getApiKey: async (providerName) => {
            const key = await getApiKeyForProvider(providerName);
            if (!key) {
              throw new Error(
                `No API key found for provider "${providerName}"`,
              );
            }
            return key;
          },
        }),
      });

      // Resume messages from the transcript if present.
      const prior = sessionManager.loadSession().messages;
      if (prior.length > 0) {
        agent.replaceMessages(prior);
      }

      const session = new AgentSession({
        agent,
        sessionManager,
        settingsManager,
      });

      const assistantTexts: string[] = [];
      const toolDebouncer = createToolDebouncer((toolName, metas) => {
        if (!params.onPartialReply) return;
        const text = formatToolAggregate(toolName, metas);
        const { text: cleanedText, mediaUrls } = splitMediaFromOutput(text);
        void params.onPartialReply({
          text: cleanedText,
          mediaUrls: mediaUrls?.length ? mediaUrls : undefined,
        });
      });

      const toolMetas: Array<{ toolName?: string; meta?: string }> = [];
      const toolMetaById = new Map<string, string | undefined>();
      let deltaBuffer = "";
      let lastStreamedAssistant: string | undefined;
      let aborted = false;

      const unsubscribe = session.subscribe(
        (evt: AgentEvent | { type: string; [k: string]: unknown }) => {
          if (evt.type === "tool_execution_start") {
            const toolName = String(
              (evt as AgentEvent & { toolName: string }).toolName,
            );
            const toolCallId = String(
              (evt as AgentEvent & { toolCallId: string }).toolCallId,
            );
            const args = (evt as AgentEvent & { args: unknown }).args;
            const meta = inferToolMetaFromArgs(toolName, args);
            toolMetaById.set(toolCallId, meta);

            emitAgentEvent({
              runId: params.runId,
              stream: "tool",
              data: {
                phase: "start",
                name: toolName,
                toolCallId,
                args: args as Record<string, unknown>,
              },
            });
            params.onAgentEvent?.({
              stream: "tool",
              data: { phase: "start", name: toolName, toolCallId },
            });
          }

          if (evt.type === "tool_execution_end") {
            const toolName = String(
              (evt as AgentEvent & { toolName: string }).toolName,
            );
            const toolCallId = String(
              (evt as AgentEvent & { toolCallId: string }).toolCallId,
            );
            const isError = Boolean(
              (evt as AgentEvent & { isError: boolean }).isError,
            );
            const meta = toolMetaById.get(toolCallId);
            toolMetas.push({ toolName, meta });
            toolDebouncer.push(toolName, meta);

            emitAgentEvent({
              runId: params.runId,
              stream: "tool",
              data: {
                phase: "result",
                name: toolName,
                toolCallId,
                meta,
                isError,
              },
            });
            params.onAgentEvent?.({
              stream: "tool",
              data: {
                phase: "result",
                name: toolName,
                toolCallId,
                meta,
                isError,
              },
            });
          }

          if (evt.type === "message_update") {
            const msg = (evt as AgentEvent & { message: AppMessage }).message;
            if (msg?.role === "assistant") {
              const assistantEvent = (
                evt as AgentEvent & { assistantMessageEvent?: unknown }
              ).assistantMessageEvent;
              const assistantRecord =
                assistantEvent && typeof assistantEvent === "object"
                  ? (assistantEvent as Record<string, unknown>)
                  : undefined;
              const evtType =
                typeof assistantRecord?.type === "string"
                  ? assistantRecord.type
                  : "";
              if (
                evtType === "text_delta" ||
                evtType === "text_start" ||
                evtType === "text_end"
              ) {
                const chunk =
                  typeof assistantRecord?.delta === "string"
                    ? assistantRecord.delta
                    : typeof assistantRecord?.content === "string"
                      ? assistantRecord.content
                      : "";
                if (chunk) {
                  deltaBuffer += chunk;
                  const next = deltaBuffer.trim();
                  if (
                    next &&
                    next !== lastStreamedAssistant &&
                    params.onPartialReply
                  ) {
                    lastStreamedAssistant = next;
                    const { text: cleanedText, mediaUrls } =
                      splitMediaFromOutput(next);
                    void params.onPartialReply({
                      text: cleanedText,
                      mediaUrls: mediaUrls?.length ? mediaUrls : undefined,
                    });
                  }
                }
              }
            }
          }

          if (evt.type === "message_end") {
            const msg = (evt as AgentEvent & { message: AppMessage }).message;
            if (msg?.role === "assistant") {
              const text = extractAssistantText(msg as AssistantMessage);
              if (text) assistantTexts.push(text);
              deltaBuffer = "";
            }
          }

          if (evt.type === "agent_end") {
            toolDebouncer.flush();
          }
        },
      );

      const abortTimer = setTimeout(
        () => {
          aborted = true;
          void session.abort();
        },
        Math.max(1, params.timeoutMs),
      );

      let messagesSnapshot: AppMessage[] = [];
      let sessionIdUsed = session.sessionId;
      try {
        await session.prompt(params.prompt);
        messagesSnapshot = session.messages.slice();
        sessionIdUsed = session.sessionId;
      } finally {
        clearTimeout(abortTimer);
        unsubscribe();
        toolDebouncer.flush();
        session.dispose();
      }

      const lastAssistant = messagesSnapshot
        .slice()
        .reverse()
        .find((m) => (m as AppMessage)?.role === "assistant") as
        | AssistantMessage
        | undefined;

      const usage = lastAssistant?.usage;
      const agentMeta: EmbeddedPiAgentMeta = {
        sessionId: sessionIdUsed,
        provider: lastAssistant?.provider ?? provider,
        model: lastAssistant?.model ?? model.id,
        usage: usage
          ? {
              input: usage.input,
              output: usage.output,
              cacheRead: usage.cacheRead,
              cacheWrite: usage.cacheWrite,
              total: usage.totalTokens,
            }
          : undefined,
      };

      const replyItems: Array<{ text: string; media?: string[] }> = [];

      const inlineToolResults =
        params.verboseLevel === "on" &&
        !params.onPartialReply &&
        toolMetas.length > 0;
      if (inlineToolResults) {
        for (const { toolName, meta } of toolMetas) {
          const agg = formatToolAggregate(toolName, meta ? [meta] : []);
          const { text: cleanedText, mediaUrls } = splitMediaFromOutput(agg);
          if (cleanedText)
            replyItems.push({ text: cleanedText, media: mediaUrls });
        }
      }

      for (const text of assistantTexts.length
        ? assistantTexts
        : lastAssistant
          ? [extractAssistantText(lastAssistant)]
          : []) {
        const { text: cleanedText, mediaUrls } = splitMediaFromOutput(text);
        if (!cleanedText && (!mediaUrls || mediaUrls.length === 0)) continue;
        replyItems.push({ text: cleanedText, media: mediaUrls });
      }

      const payloads = replyItems
        .map((item) => ({
          text: item.text?.trim() ? item.text.trim() : undefined,
          mediaUrls: item.media?.length ? item.media : undefined,
          mediaUrl: item.media?.[0],
        }))
        .filter(
          (p) =>
            p.text || p.mediaUrl || (p.mediaUrls && p.mediaUrls.length > 0),
        );

      return {
        payloads: payloads.length ? payloads : undefined,
        meta: {
          durationMs: Date.now() - started,
          agentMeta,
          aborted,
        },
      };
    } finally {
      process.chdir(prevCwd);
    }
  });
}
