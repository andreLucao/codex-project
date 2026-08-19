import { isJsonObject } from "../whatsapp/cloud-api.js";
import type { MessageKind } from "./types.js";

export interface MetaInboundMessage {
  providerMessageId: string;
  supplierPhone: string;
  contextMessageId?: string;
  type: MessageKind;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  receivedAt: string;
}

export function parseMetaInboundMessages(payload: Record<string, unknown>): MetaInboundMessage[] {
  const parsed: MetaInboundMessage[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isJsonObject(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isJsonObject(change) || !isJsonObject(change.value) || !Array.isArray(change.value.messages)) continue;
      for (const message of change.value.messages) {
        const item = parseMessage(message);
        if (item) parsed.push(item);
      }
    }
  }
  return parsed;
}

function parseMessage(value: unknown): MetaInboundMessage | null {
  if (!isJsonObject(value) || typeof value.id !== "string" || typeof value.from !== "string") return null;
  const contextMessageId = isJsonObject(value.context) && typeof value.context.id === "string" ? value.context.id : undefined;
  const timestamp = typeof value.timestamp === "string" ? Number(value.timestamp) * 1_000 : Date.now();
  const base = {
    providerMessageId: value.id,
    supplierPhone: value.from,
    contextMessageId,
    receivedAt: new Date(timestamp).toISOString(),
  };
  if (value.type === "text" && isJsonObject(value.text) && typeof value.text.body === "string") {
    return { ...base, type: "text", text: value.text.body };
  }
  if (value.type === "audio" && isJsonObject(value.audio) && typeof value.audio.id === "string") {
    return { ...base, type: "audio", mediaId: value.audio.id, mimeType: readMime(value.audio, "audio/ogg") };
  }
  if (value.type === "image" && isJsonObject(value.image) && typeof value.image.id === "string") {
    return { ...base, type: "image", mediaId: value.image.id, mimeType: readMime(value.image, "image/jpeg") };
  }
  return null;
}

function readMime(value: Record<string, unknown>, fallback: string): string {
  return typeof value.mime_type === "string" ? value.mime_type : fallback;
}
