import fs from "node:fs/promises";
import sharp from "sharp";

import { isVerbose, logVerbose } from "../globals.js";
import {
  type MediaKind,
  maxBytesForKind,
  mediaKindFromMime,
} from "../media/constants.js";
import { detectMime } from "../media/mime.js";

export async function loadWebMedia(
  mediaUrl: string,
  maxBytes?: number,
): Promise<{ buffer: Buffer; contentType?: string; kind: MediaKind }> {
  if (mediaUrl.startsWith("file://")) {
    mediaUrl = mediaUrl.replace("file://", "");
  }

  const optimizeAndClampImage = async (buffer: Buffer, cap: number) => {
    const originalSize = buffer.length;
    const optimized = await optimizeImageToJpeg(buffer, cap);
    if (optimized.optimizedSize < originalSize && isVerbose()) {
      logVerbose(
        `Optimized media from ${(originalSize / (1024 * 1024)).toFixed(2)}MB to ${(optimized.optimizedSize / (1024 * 1024)).toFixed(2)}MB (side≤${optimized.resizeSide}px, q=${optimized.quality})`,
      );
    }
    if (optimized.buffer.length > cap) {
      throw new Error(
        `Media could not be reduced below ${(cap / (1024 * 1024)).toFixed(0)}MB (got ${(
          optimized.buffer.length / (1024 * 1024)
        ).toFixed(2)}MB)`,
      );
    }
    return {
      buffer: optimized.buffer,
      contentType: "image/jpeg",
      kind: "image" as const,
    };
  };

  if (/^https?:\/\//i.test(mediaUrl)) {
    const res = await fetch(mediaUrl);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to fetch media: HTTP ${res.status}`);
    }
    const array = Buffer.from(await res.arrayBuffer());
    const contentType = detectMime({
      buffer: array,
      headerMime: res.headers.get("content-type"),
      filePath: mediaUrl,
    });
    const kind = mediaKindFromMime(contentType);
    const cap = Math.min(
      maxBytes ?? maxBytesForKind(kind),
      maxBytesForKind(kind),
    );
    if (kind === "image") {
      return optimizeAndClampImage(array, cap);
    }
    if (array.length > cap) {
      throw new Error(
        `Media exceeds ${(cap / (1024 * 1024)).toFixed(0)}MB limit (got ${(
          array.length / (1024 * 1024)
        ).toFixed(2)}MB)`,
      );
    }
    return { buffer: array, contentType: contentType ?? undefined, kind };
  }

  // Local path
  const data = await fs.readFile(mediaUrl);
  const mime = detectMime({ buffer: data, filePath: mediaUrl });
  const kind = mediaKindFromMime(mime);
  const cap = Math.min(
    maxBytes ?? maxBytesForKind(kind),
    maxBytesForKind(kind),
  );
  if (kind === "image") {
    return optimizeAndClampImage(data, cap);
  }
  if (data.length > cap) {
    throw new Error(
      `Media exceeds ${(cap / (1024 * 1024)).toFixed(0)}MB limit (got ${(
        data.length / (1024 * 1024)
      ).toFixed(2)}MB)`,
    );
  }
  return { buffer: data, contentType: mime, kind };
}

export async function optimizeImageToJpeg(
  buffer: Buffer,
  maxBytes: number,
): Promise<{
  buffer: Buffer;
  optimizedSize: number;
  resizeSide: number;
  quality: number;
}> {
  // Try a grid of sizes/qualities until under the limit.
  const sides = [2048, 1536, 1280, 1024, 800];
  const qualities = [80, 70, 60, 50, 40];
  let smallest: {
    buffer: Buffer;
    size: number;
    resizeSide: number;
    quality: number;
  } | null = null;

  for (const side of sides) {
    for (const quality of qualities) {
      const out = await sharp(buffer)
        .resize({
          width: side,
          height: side,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      const size = out.length;
      if (!smallest || size < smallest.size) {
        smallest = { buffer: out, size, resizeSide: side, quality };
      }
      if (size <= maxBytes) {
        return {
          buffer: out,
          optimizedSize: size,
          resizeSide: side,
          quality,
        };
      }
    }
  }

  if (smallest) {
    return {
      buffer: smallest.buffer,
      optimizedSize: smallest.size,
      resizeSide: smallest.resizeSide,
      quality: smallest.quality,
    };
  }

  throw new Error("Failed to optimize image");
}
