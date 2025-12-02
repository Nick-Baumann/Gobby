import path from "node:path";

import {
  OPENCODE_BIN,
  OPENCODE_IDENTITY_PREFIX,
  parseOpencodeJson,
  summarizeOpencodeMetadata,
} from "../auto-reply/opencode.js";
import type { AgentMeta, AgentParseResult, AgentSpec, BuildArgsContext } from "./types.js";

function toMeta(parsed: ReturnType<typeof parseOpencodeJson>): AgentMeta | undefined {
  const summary = summarizeOpencodeMetadata(parsed.meta);
  return summary ? { extra: { summary } } : undefined;
}

export const opencodeSpec: AgentSpec = {
  kind: "opencode",
  isInvocation: (argv) => argv.length > 0 && path.basename(argv[0]) === OPENCODE_BIN,
  buildArgs: (ctx) => {
    const argv = [...ctx.argv];
    const wantsJson = ctx.format === "json";

    // Ensure format json for parsing
    if (wantsJson) {
      const hasFormat = argv.some(
        (part) => part === "--format" || part.startsWith("--format="),
      );
      if (!hasFormat) {
        const insertBeforeBody = Math.max(argv.length - 1, 0);
        argv.splice(insertBeforeBody, 0, "--format", "json");
      }
    }

    // Session args default to --session
    // Identity prefix
    const shouldPrependIdentity = !(ctx.sendSystemOnce && ctx.systemSent);
    if (shouldPrependIdentity && argv[ctx.bodyIndex]) {
      const existingBody = argv[ctx.bodyIndex];
      argv[ctx.bodyIndex] = [ctx.identityPrefix ?? OPENCODE_IDENTITY_PREFIX, existingBody]
        .filter(Boolean)
        .join("\n\n");
    }

    return argv;
  },
  parseOutput: (rawStdout) => {
    const parsed = parseOpencodeJson(rawStdout);
    const text = parsed.text ?? rawStdout.trim();
    return {
      text: text?.trim(),
      meta: toMeta(parsed),
    };
  },
};
