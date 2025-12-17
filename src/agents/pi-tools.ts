import type { AgentTool } from "@mariozechner/pi-ai";
import { codingTools, readTool } from "@mariozechner/pi-coding-agent";

import { detectMime } from "../media/mime.js";

// TODO(steipete): Remove this wrapper once pi-mono ships file-magic MIME detection
// for `read` image payloads in `@mariozechner/pi-coding-agent` (then switch back to `codingTools` directly).
type ImageContentBlock = {
  type: "image";
  data: string;
  mimeType: string;
};

type TextContentBlock = {
  type: "text";
  text: string;
};

type ToolResult = {
  content: Array<
    ImageContentBlock | TextContentBlock | Record<string, unknown>
  >;
  details?: unknown;
};

function sniffMimeFromBase64(base64: string): string | undefined {
  const trimmed = base64.trim();
  if (!trimmed) return undefined;

  const take = Math.min(256, trimmed.length);
  const sliceLen = take - (take % 4);
  if (sliceLen < 8) return undefined;

  try {
    const head = Buffer.from(trimmed.slice(0, sliceLen), "base64");
    return detectMime({ buffer: head });
  } catch {
    return undefined;
  }
}

function rewriteReadImageHeader(text: string, mimeType: string): string {
  // pi-coding-agent uses: "Read image file [image/png]"
  if (text.startsWith("Read image file [") && text.endsWith("]")) {
    return `Read image file [${mimeType}]`;
  }
  return text;
}

function normalizeReadImageResult(
  result: ToolResult,
  filePath: string,
): ToolResult {
  const content = Array.isArray(result.content) ? result.content : [];

  const image = content.find(
    (b): b is ImageContentBlock =>
      !!b &&
      typeof b === "object" &&
      (b as ImageContentBlock).type === "image" &&
      typeof (b as ImageContentBlock).data === "string" &&
      typeof (b as ImageContentBlock).mimeType === "string",
  );
  if (!image) return result;

  if (!image.data.trim()) {
    throw new Error(`read: image payload is empty (${filePath})`);
  }

  const sniffed = sniffMimeFromBase64(image.data);
  if (!sniffed) return result;

  if (!sniffed.startsWith("image/")) {
    throw new Error(
      `read: file looks like ${sniffed} but was treated as ${image.mimeType} (${filePath})`,
    );
  }

  if (sniffed === image.mimeType) return result;

  const nextContent = content.map((block) => {
    if (
      block &&
      typeof block === "object" &&
      (block as ImageContentBlock).type === "image"
    ) {
      const b = block as ImageContentBlock;
      return { ...b, mimeType: sniffed };
    }
    if (
      block &&
      typeof block === "object" &&
      (block as TextContentBlock).type === "text" &&
      typeof (block as TextContentBlock).text === "string"
    ) {
      const b = block as TextContentBlock;
      return { ...b, text: rewriteReadImageHeader(b.text, sniffed) };
    }
    return block;
  });

  return { ...result, content: nextContent };
}

function createClawdisReadTool(base: AgentTool): AgentTool {
  return {
    ...base,
    execute: async (toolCallId, params, signal) => {
      const result = (await base.execute(
        toolCallId,
        params,
        signal,
      )) as ToolResult;
      const record =
        params && typeof params === "object"
          ? (params as Record<string, unknown>)
          : undefined;
      const filePath =
        typeof record?.path === "string" ? String(record.path) : "<unknown>";
      return normalizeReadImageResult(result, filePath);
    },
  };
}

export function createClawdisCodingTools(): AgentTool[] {
  return codingTools.map((tool) =>
    tool.name === readTool.name ? createClawdisReadTool(tool) : tool,
  );
}
