import type { AnyMessageContent } from "@whiskeysockets/baileys";

import { logVerbose } from "../globals.js";
import { logInfo } from "../logger.js";
import { toWhatsappJid } from "../utils.js";
import { loadWebMedia } from "./media.js";
import { createWaSocket, waitForWaConnection } from "./session.js";

export async function sendMessageWeb(
  to: string,
  body: string,
  options: { verbose: boolean; mediaUrl?: string },
): Promise<{ messageId: string; toJid: string }> {
  const sock = await createWaSocket(false, options.verbose);
  try {
    logInfo("🔌 Connecting to WhatsApp Web…");
    await waitForWaConnection(sock);
    // waitForWaConnection sets up listeners and error handling; keep the presence update safe.
    const jid = toWhatsappJid(to);
    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch (err) {
      logVerbose(`Presence update skipped: ${String(err)}`);
    }
    let payload: AnyMessageContent = { text: body };
    if (options.mediaUrl) {
      const media = await loadWebMedia(options.mediaUrl);
      payload = {
        image: media.buffer,
        caption: body || undefined,
        mimetype: media.contentType,
      };
    }
    logInfo(
      `📤 Sending via web session -> ${jid}${options.mediaUrl ? " (media)" : ""}`,
    );
    const result = await sock.sendMessage(jid, payload);
    const messageId = result?.key?.id ?? "unknown";
    logInfo(
      `✅ Sent via web session. Message ID: ${messageId} -> ${jid}${options.mediaUrl ? " (media)" : ""}`,
    );
    return { messageId, toJid: jid };
  } finally {
    try {
      sock.ws?.close();
    } catch (err) {
      logVerbose(`Socket close failed: ${String(err)}`);
    }
  }
}
