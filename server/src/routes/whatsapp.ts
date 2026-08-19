import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export type RequestWithRawBody = Request & { rawBody?: Buffer };

type JsonObject = Record<string, unknown>;

type WebhookMessage = JsonObject & {
  from: string;
  id: string;
  timestamp: string;
  type: string;
};

export type ConversationHistoryMessage =
  | {
      id: string;
      direction: "sent";
      whatsappMessageId: string | null;
      type: string;
      payload: Prisma.JsonValue;
      status: "PENDING" | "SENT" | "FAILED";
      timestamp: Date;
    }
  | {
      id: string;
      direction: "received";
      sentMessageId: string;
      whatsappMessageId: string;
      type: string;
      payload: Prisma.JsonValue;
      timestamp: Date;
    };

export type ConversationHistory = {
  contact: {
    id: string;
    phoneNumber: string;
    name: string | null;
    user: {
      id: string;
      restaurantName: string;
      responsibleName: string;
      address: string;
      frequentSupplies: string[];
    } | null;
  };
  messages: ConversationHistoryMessage[];
};

class WhatsAppValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppValidationError";
  }
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

export const whatsappRouter = Router();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`A variavel de ambiente ${name} nao foi configurada.`);
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizePhoneNumber(phoneNumber: string): string {
  const trimmedPhoneNumber = phoneNumber.trim();

  if (!trimmedPhoneNumber || !/^[+\d\s().-]+$/.test(trimmedPhoneNumber)) {
    throw new WhatsAppValidationError(
      "Informe um telefone valido, incluindo o codigo do pais e o DDD.",
    );
  }

  const digits = trimmedPhoneNumber.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    throw new WhatsAppValidationError(
      "Informe um telefone valido, incluindo o codigo do pais e o DDD.",
    );
  }

  return digits;
}

function getWhatsAppMessageId(responseBody: unknown): string | undefined {
  if (!isJsonObject(responseBody) || !Array.isArray(responseBody.messages)) {
    return undefined;
  }

  const firstMessage = responseBody.messages[0];
  return isJsonObject(firstMessage) && typeof firstMessage.id === "string"
    ? firstMessage.id
    : undefined;
}

async function markSentMessageAsFailed(sentMessageId: string): Promise<void> {
  try {
    await prisma.sentMessage.update({
      where: { id: sentMessageId },
      data: { status: "FAILED" },
    });
  } catch (error) {
    console.error("Nao foi possivel marcar a mensagem como falha:", error);
  }
}

async function sendWhatsAppPayload(
  messagePayload: JsonObject & { to: string },
): Promise<unknown> {
  const accessToken = requiredEnv("META_WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requiredEnv("META_WHATSAPP_PHONE_NUMBER_ID");
  const graphApiVersion = requiredEnv("META_GRAPH_API_VERSION");
  const graphApiBaseUrl = (
    process.env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com"
  ).replace(/\/$/, "");

  const to = normalizePhoneNumber(messagePayload.to);
  const payload: JsonObject & { to: string } = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    ...messagePayload,
    to,
  };
  const contact = await prisma.contact.upsert({
    where: { phoneNumber: to },
    update: {},
    create: { phoneNumber: to },
  });
  const sentMessage = await prisma.sentMessage.create({
    data: {
      contactId: contact.id,
      type: typeof payload.type === "string" ? payload.type : "unknown",
      payload: toJsonValue(payload),
    },
  });

  let metaResponse: globalThis.Response;

  try {
    metaResponse = await fetch(
      `${graphApiBaseUrl}/${graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    await markSentMessageAsFailed(sentMessage.id);
    throw error;
  }

  const responseBody: unknown = await metaResponse.json().catch(() => null);

  if (!metaResponse.ok) {
    await markSentMessageAsFailed(sentMessage.id);
    throw new WhatsAppApiError(
      "A Meta recusou o envio da mensagem.",
      metaResponse.status,
      responseBody,
    );
  }

  await prisma.sentMessage.update({
    where: { id: sentMessage.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      whatsappMessageId: getWhatsAppMessageId(responseBody),
    },
  });

  return responseBody;
}

function respondWithSendError(res: Response, error: unknown): void {
  if (error instanceof WhatsAppApiError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro inesperado ao enviar a mensagem.";
  const status = error instanceof WhatsAppValidationError ? 400 : 500;
  res.status(status).json({ error: message });
}

/**
 * Inicia uma conversa usando um template previamente aprovado pela Meta.
 * Troque o nome e o idioma abaixo pelos dados do template da sua conta.
 */
export async function sendFirstMessage(to: string): Promise<unknown> {
  const template = {
    name: "hello_world",
    language: { code: "en_US" },
  };

  return sendWhatsAppPayload({
    to: normalizePhoneNumber(to),
    type: "template",
    template,
  });
}

/**
 * Envia texto livre. Use durante a janela de atendimento iniciada quando o
 * contato envia uma mensagem para o numero da empresa.
 */
export async function sendMessage(
  to: string,
  message: string,
  previewUrl = false,
): Promise<unknown> {
  if (!message.trim()) {
    throw new WhatsAppValidationError("A mensagem nao pode estar vazia.");
  }

  return sendWhatsAppPayload({
    to: normalizePhoneNumber(to),
    type: "text",
    text: {
      body: message,
      preview_url: previewUrl,
    },
  });
}

/** Busca todas as mensagens de um contato em ordem cronologica. */
export async function getConversationHistory(
  phoneNumber: string,
): Promise<ConversationHistory | null> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const contact = await prisma.contact.findUnique({
    where: { phoneNumber: normalizedPhoneNumber },
    select: {
      id: true,
      phoneNumber: true,
      name: true,
      user: {
        select: {
          id: true,
          restaurantName: true,
          responsibleName: true,
          address: true,
          frequentSupplies: true,
        },
      },
      sentMessages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          whatsappMessageId: true,
          type: true,
          payload: true,
          status: true,
          sentAt: true,
          createdAt: true,
        },
      },
      receivedMessages: {
        orderBy: { receivedAt: "asc" },
        select: {
          id: true,
          sentMessageId: true,
          whatsappMessageId: true,
          type: true,
          payload: true,
          receivedAt: true,
        },
      },
    },
  });

  if (!contact) return null;

  const sentMessages: ConversationHistoryMessage[] = contact.sentMessages.map(
    (message) => ({
      id: message.id,
      direction: "sent",
      whatsappMessageId: message.whatsappMessageId,
      type: message.type,
      payload: message.payload,
      status: message.status,
      timestamp: message.sentAt ?? message.createdAt,
    }),
  );
  const receivedMessages: ConversationHistoryMessage[] =
    contact.receivedMessages.map((message) => ({
      id: message.id,
      direction: "received",
      sentMessageId: message.sentMessageId,
      whatsappMessageId: message.whatsappMessageId,
      type: message.type,
      payload: message.payload,
      timestamp: message.receivedAt,
    }));
  const messages = [...sentMessages, ...receivedMessages].sort(
    (first, second) => first.timestamp.getTime() - second.timestamp.getTime(),
  );

  return {
    contact: {
      id: contact.id,
      phoneNumber: contact.phoneNumber,
      name: contact.name,
      user: contact.user,
    },
    messages,
  };
}

function hasValidMetaSignature(req: RequestWithRawBody, appSecret: string): boolean {
  const receivedSignature = req.header("x-hub-signature-256");

  if (!receivedSignature || !req.rawBody) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex")}`;
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Retorna o historico de conversa do telefone informado. */
whatsappRouter.get("/messages/history", async (req, res) => {
  const phoneNumber = req.query.phoneNumber;

  if (typeof phoneNumber !== "string") {
    res.status(400).json({ error: "O parametro 'phoneNumber' e obrigatorio." });
    return;
  }

  try {
    const history = await getConversationHistory(phoneNumber);

    if (!history) {
      res.status(404).json({ error: "Contato nao encontrado." });
      return;
    }

    res.status(200).json(history);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao buscar o historico.";
    const status = error instanceof WhatsAppValidationError ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * Envia uma mensagem usando o endpoint /{PHONE_NUMBER_ID}/messages da
 * WhatsApp Cloud API. O corpo pode usar o formato oficial da Meta, por exemplo:
 * { "to": "5511999999999", "type": "text", "text": { "body": "Ola" } }
 *
 * Para mensagens de texto, tambem aceitamos o atalho:
 * { "to": "5511999999999", "message": "Ola" }
 */
whatsappRouter.post("/messages", async (req, res) => {
  if (!isJsonObject(req.body)) {
    res.status(400).json({ error: "O corpo da requisicao deve ser um objeto JSON." });
    return;
  }

  const { to, message, previewUrl, ...officialMessage } = req.body;

  if (typeof to !== "string" || !to.trim()) {
    res.status(400).json({ error: "O campo 'to' e obrigatorio." });
    return;
  }

  if (!(typeof message === "string" && message.trim())) {
    if (typeof officialMessage.type !== "string") {
      res.status(400).json({
        error: "Informe 'message' para texto simples ou um payload oficial com o campo 'type'.",
      });
      return;
    }
  }

  try {
    const responseBody =
      typeof message === "string" && message.trim()
        ? await sendMessage(to, message, previewUrl === true)
        : await sendWhatsAppPayload({ ...officialMessage, to });

    res.status(200).json(responseBody);
  } catch (error) {
    respondWithSendError(res, error);
  }
});

/** Inicia uma conversa enviando o template definido em sendFirstMessage. */
whatsappRouter.post("/messages/first", async (req, res) => {
  if (!isJsonObject(req.body) || typeof req.body.to !== "string") {
    res.status(400).json({ error: "O campo 'to' e obrigatorio." });
    return;
  }

  try {
    const responseBody = await sendFirstMessage(req.body.to);
    res.status(200).json(responseBody);
  } catch (error) {
    respondWithSendError(res, error);
  }
});

/** Valida a URL de callback durante a configuracao do webhook na Meta. */
whatsappRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const configuredVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (
    mode === "subscribe" &&
    typeof verifyToken === "string" &&
    configuredVerifyToken &&
    verifyToken === configuredVerifyToken &&
    typeof challenge === "string"
  ) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }

  res.sendStatus(403);
});

function getWebhookMessages(body: JsonObject): Array<{
  message: WebhookMessage;
  contactName?: string;
}> {
  const result: Array<{ message: WebhookMessage; contactName?: string }> = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    if (!isJsonObject(entry) || !Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (!isJsonObject(change) || !isJsonObject(change.value)) continue;

      const value = change.value;
      const namesByPhone = new Map<string, string>();
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];

      for (const contact of contacts) {
        if (
          isJsonObject(contact) &&
          typeof contact.wa_id === "string" &&
          isJsonObject(contact.profile) &&
          typeof contact.profile.name === "string"
        ) {
          namesByPhone.set(contact.wa_id, contact.profile.name.slice(0, 120));
        }
      }

      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        if (
          isJsonObject(message) &&
          typeof message.from === "string" &&
          typeof message.id === "string" &&
          typeof message.timestamp === "string" &&
          typeof message.type === "string"
        ) {
          result.push({
            message: message as WebhookMessage,
            contactName: namesByPhone.get(message.from),
          });
        }
      }
    }
  }

  return result;
}

function parseWhatsAppTimestamp(timestamp: string): Date {
  const seconds = Number(timestamp);
  const date = new Date(seconds * 1_000);

  if (!Number.isFinite(seconds) || Number.isNaN(date.getTime())) {
    throw new WhatsAppValidationError("Timestamp invalido no evento do WhatsApp.");
  }

  return date;
}

async function saveReceivedMessage(
  message: WebhookMessage,
  contactName?: string,
): Promise<void> {
  const duplicate = await prisma.receivedMessage.findUnique({
    where: { whatsappMessageId: message.id },
    select: { id: true },
  });

  if (duplicate) return;

  const phoneNumber = normalizePhoneNumber(message.from);
  const receivedAt = parseWhatsAppTimestamp(message.timestamp);
  const contact = await prisma.contact.upsert({
    where: { phoneNumber },
    update: contactName ? { name: contactName } : {},
    create: { phoneNumber, name: contactName },
  });
  const context = isJsonObject(message.context) ? message.context : undefined;
  const contextMessageId =
    context && typeof context.id === "string" ? context.id : undefined;

  const referencedSentMessage = contextMessageId
    ? await prisma.sentMessage.findFirst({
        where: {
          contactId: contact.id,
          whatsappMessageId: contextMessageId,
        },
      })
    : null;
  const sentMessage =
    referencedSentMessage ??
    (await prisma.sentMessage.findFirst({
      where: {
        contactId: contact.id,
        status: { in: ["PENDING", "SENT"] },
        createdAt: { lte: receivedAt },
      },
      orderBy: { createdAt: "desc" },
    }));

  if (!sentMessage) {
    throw new Error(
      `Nao existe mensagem enviada para associar a mensagem recebida ${message.id}.`,
    );
  }

  await prisma.receivedMessage.upsert({
    where: { whatsappMessageId: message.id },
    update: {},
    create: {
      contactId: contact.id,
      sentMessageId: sentMessage.id,
      whatsappMessageId: message.id,
      type: message.type,
      payload: toJsonValue(message),
      receivedAt,
    },
  });
}

/** Recebe notificacoes de mensagens, status e demais eventos do WhatsApp. */
whatsappRouter.post("/webhook", async (req: RequestWithRawBody, res) => {
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (appSecret && !hasValidMetaSignature(req, appSecret)) {
    res.status(401).json({ error: "Assinatura do webhook invalida." });
    return;
  }

  if (!isJsonObject(req.body) || req.body.object !== "whatsapp_business_account") {
    res.status(400).json({ error: "Evento de webhook invalido." });
    return;
  }

  try {
    const messages = getWebhookMessages(req.body);

    for (const { message, contactName } of messages) {
      await saveReceivedMessage(message, contactName);
    }
  } catch (error) {
    console.error("Falha ao salvar evento recebido do WhatsApp:", error);
    res.status(500).json({
      error: "Nao foi possivel salvar as mensagens recebidas.",
    });
    return;
  }

  // A Meta espera uma resposta 200 rapida para considerar o evento entregue.
  res.sendStatus(200);
});
