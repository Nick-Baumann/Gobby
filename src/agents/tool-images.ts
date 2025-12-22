import type { AgentToolResult } from "@mariozechner/pi-ai";

import { getImageMetadata, resizeToJpeg } from "../media/image-ops.js";
import { detectMime } from "../media/mime.js";

type ToolContentBlock = AgentToolResult<unknown>["content"][number];
type ImageContentBlock = Extract<ToolContentBlock, { type: "image" }>;
type TextContentBlock = Extract<ToolContentBlock, { type: "text" }>;

// Anthropic Messages API limitation (observed in Clawdis sessions):
// When sending many images in a single request (e.g. via session history + tool results),
// Anthropic rejects any image where *either* dimension exceeds 2000px.
//
// To keep sessions resilient (and avoid "silent" WhatsApp non-replies), we auto-downscale
// all base64 image blocks above this limit while preserving aspect ratio.
const MAX_IMAGE_DIMENSION_PX = 2000;

function isImageBlock(block: unknown): block is ImageContentBlock {
  if (!block || typeof block !== "object") return false;
  const rec = block as Record<string, unknown>;
  return (
    rec.type === "image" &&
    typeof rec.data === "string" &&
    typeof rec.mimeType === "string"
  );
}

function isTextBlock(block: unknown): block is TextContentBlock {
  if (!block || typeof block !== "object") return false;
  const rec = block as Record<string, unknown>;
  return rec.type === "text" && typeof rec.text === "string";
}

async function resizeImageBase64IfNeeded(params: {
  base64: string;
  mimeType: string;
  maxDimensionPx: number;
}): Promise<{ base64: string; mimeType: string; resized: boolean }> {
  const buf = Buffer.from(params.base64, "base64");
  const meta = await getImageMetadata(buf);
  const width = meta?.width;
  const height = meta?.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    (width <= params.maxDimensionPx && height <= params.maxDimensionPx)
  ) {
    return { base64: params.base64, mimeType: params.mimeType, resized: false };
  }

  const mime = params.mimeType.toLowerCase();
  let out: Buffer;
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    };
    const sharp = mod.default ?? (mod as unknown as typeof import("sharp"));
    const img = sharp(buf, { failOnError: false }).resize({
      width: params.maxDimensionPx,
      height: params.maxDimensionPx,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (mime === "image/jpeg" || mime === "image/jpg") {
      out = await img.jpeg({ quality: 85 }).toBuffer();
    } else if (mime === "image/webp") {
      out = await img.webp({ quality: 85 }).toBuffer();
    } else if (mime === "image/png") {
      out = await img.png().toBuffer();
    } else {
      out = await img.png().toBuffer();
    }
  } catch {
    // Bun can't load sharp native addons. Fall back to a JPEG conversion.
    out = await resizeToJpeg({
      buffer: buf,
      maxSide: params.maxDimensionPx,
      quality: 85,
      withoutEnlargement: true,
    });
  }

  const sniffed = await detectMime({ buffer: out.slice(0, 256) });
  const nextMime = sniffed?.startsWith("image/") ? sniffed : params.mimeType;

  return { base64: out.toString("base64"), mimeType: nextMime, resized: true };
}

export async function sanitizeContentBlocksImages(
  blocks: ToolContentBlock[],
  label: string,
  opts: { maxDimensionPx?: number } = {},
): Promise<ToolContentBlock[]> {
  const maxDimensionPx = Math.max(
    opts.maxDimensionPx ?? MAX_IMAGE_DIMENSION_PX,
    1,
  );
  const out: ToolContentBlock[] = [];

  for (const block of blocks) {
    if (!isImageBlock(block)) {
      out.push(block);
      continue;
    }

    const data = block.data.trim();
    if (!data) {
      out.push({
        type: "text",
        text: `[${label}] omitted empty image payload`,
      } satisfies TextContentBlock);
      continue;
    }

    try {
      const resized = await resizeImageBase64IfNeeded({
        base64: data,
        mimeType: block.mimeType,
        maxDimensionPx,
      });
      out.push({ ...block, data: resized.base64, mimeType: resized.mimeType });
    } catch (err) {
      out.push({
        type: "text",
        text: `[${label}] omitted image payload: ${String(err)}`,
      } satisfies TextContentBlock);
    }
  }

  return out;
}

export async function sanitizeToolResultImages(
  result: AgentToolResult<unknown>,
  label: string,
  opts: { maxDimensionPx?: number } = {},
): Promise<AgentToolResult<unknown>> {
  const content = Array.isArray(result.content) ? result.content : [];
  if (!content.some((b) => isImageBlock(b) || isTextBlock(b))) return result;

  const next = await sanitizeContentBlocksImages(content, label, opts);
  return { ...result, content: next };
}
