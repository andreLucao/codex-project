import { describe, expect, it } from "vitest";
import { parseMetaInboundMessages } from "./meta-webhook.js";

describe("Meta WhatsApp webhook parser", () => {
  it("extracts correlated text, audio and image messages", () => {
    const messages = parseMetaInboundMessages({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [
              {
                id: "wamid.text",
                from: "5511999999999",
                timestamp: "1787140800",
                type: "text",
                context: { id: "wamid.initial" },
                text: { body: "Faço 38 o quilo com frete" },
              },
              {
                id: "wamid.audio",
                from: "5511888888888",
                timestamp: "1787140801",
                type: "audio",
                audio: { id: "media-audio", mime_type: "audio/ogg" },
              },
              {
                id: "wamid.image",
                from: "5511777777777",
                timestamp: "1787140802",
                type: "image",
                image: { id: "media-image", mime_type: "image/jpeg" },
              },
            ],
          },
        }],
      }],
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({
      providerMessageId: "wamid.text",
      supplierPhone: "5511999999999",
      contextMessageId: "wamid.initial",
      type: "text",
      text: "Faço 38 o quilo com frete",
    });
    expect(messages[1]).toMatchObject({ type: "audio", mediaId: "media-audio", mimeType: "audio/ogg" });
    expect(messages[2]).toMatchObject({ type: "image", mediaId: "media-image", mimeType: "image/jpeg" });
  });

  it("ignores delivery statuses and unsupported message types", () => {
    expect(parseMetaInboundMessages({ entry: [{ changes: [{ value: { statuses: [{ id: "status" }] } }] }] })).toEqual([]);
  });
});
