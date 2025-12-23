import { Buffer } from "node:buffer";

import type WebSocket from "ws";

export function rawDataToString(
  data: WebSocket.RawData,
  encoding: BufferEncoding = "utf8",
): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString(encoding);
  if (Array.isArray(data)) return Buffer.concat(data).toString(encoding);
  return Buffer.from(data as ArrayBuffer | ArrayBufferView).toString(encoding);
}
