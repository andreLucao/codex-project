import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { getPrisma, hasPrismaConfig } from "../lib/prisma.js";
import { isJsonObject, sendCloudMessage } from "../whatsapp/cloud-api.js";

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
  contact: { id: string; phoneNumber: string; name: string | null };
  messages: ConversationHistoryMessage[];
};

class WhatsAppValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppValidationError";
  }
}

/** Inicia uma conversa usando o template de teste padrão da Meta. */
export async function sendFirstMessage(to: string): Promise<unknown> {
  return sendWhatsAppPayload({
    to: normalizePhoneNumber(to),
    type: "template",
    template: { name: "hello_world", language: { code: "en_US" } },
  });
}

/** Envia texto livre durante a janela de atendimento de 24 horas. */
export async function sendMessage(to: string, message: string, previewUrl = false): Promise<unknown> {
  if (!message.trim()) throw new WhatsAppValidationError("A mensagem nao pode estar vazia.");
  return sendWhatsAppPayload({
    to: normalizePhoneNumber(to),
    type: "text",
    text: { body: message, preview_url: previewUrl },
  });
}

/** Busca mensagens persistidas no banco Prisma quando DATABASE_URL estiver configurada. */
export async function getConversationHistory(phoneNumber: string): Promise<ConversationHistory | null> {
  if (!hasPrismaConfig()) throw new Error("DATABASE_URL is required for WhatsApp conversation history.");
  const prisma = getPrisma();
  const contact = await prisma.contact.findUnique({
    where: { phoneNumber: normalizePhoneNumber(phoneNumber) },
    select: {
      id: true,
      phoneNumber: true,
      name: true,
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

  const sentMessages: ConversationHistoryMessage[] = contact.sentMessages.map((message) => ({
    id: message.id,
    direction: "sent",
    whatsappMessageId: message.whatsappMessageId,
    type: message.type,
    payload: message.payload,
    status: message.status,
    timestamp: message.sentAt ?? message.createdAt,
  }));
  const receivedMessages: ConversationHistoryMessage[] = contact.receivedMessages.map((message) => ({
    id: message.id,
    direction: "received",
    sentMessageId: message.sentMessageId,
    whatsappMessageId: message.whatsappMessageId,
    type: message.type,
    payload: message.payload,
    timestamp: message.receivedAt,
  }));

  return {
    contact: { id: contact.id, phoneNumber: contact.phoneNumber, name: contact.name },
    messages: [...sentMessages, ...receivedMessages].sort(
      (first, second) => first.timestamp.getTime() - second.timestamp.getTime(),
    ),
  };
}

export function createWhatsappRouter(options: { onWebhook?: (body: JsonObject) => Promise<void> } = {}) {
  const router = Router();

  router.get("/messages/history", async (req, res) => {
    if (typeof req.query.phoneNumber !== "string") {
      res.status(400).json({ error: "O parametro 'phoneNumber' e obrigatorio." });
      return;
    }
    try {
      const history = await getConversationHistory(req.query.phoneNumber);
      if (!history) {
        res.status(404).json({ error: "Contato nao encontrado." });
        return;
      }
      res.status(200).json(history);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao buscar o historico.";
      const status = error instanceof WhatsAppValidationError ? 400 : 503;
      res.status(status).json({ error: message });
    }
  });

  router.post("/messages", async (req, res) => {
    if (!isJsonObject(req.body)) {
      res.status(400).json({ error: "O corpo da requisicao deve ser um objeto JSON." });
      return;
    }

    const { to, message, previewUrl, ...officialMessage } = req.body;
    if (typeof to !== "string" || !to.trim()) {
      res.status(400).json({ error: "O campo 'to' e obrigatorio." });
      return;
    }
    if (!(typeof message === "string" && message.trim()) && typeof officialMessage.type !== "string") {
      res.status(400).json({
        error: "Informe 'message' para texto simples ou um payload oficial com o campo 'type'.",
      });
      return;
    }

    try {
      const responseBody = typeof message === "string" && message.trim()
        ? await sendMessage(to, message, previewUrl === true)
        : await sendWhatsAppPayload({ ...officialMessage, to: normalizePhoneNumber(to) });
      res.status(200).json(responseBody);
    } catch (error) {
      respondWithSendError(res, error);
    }
  });

  router.post("/messages/first", async (req, res) => {
    if (!isJsonObject(req.body) || typeof req.body.to !== "string") {
      res.status(400).json({ error: "O campo 'to' e obrigatorio." });
      return;
    }
    try {
      res.status(200).json(await sendFirstMessage(req.body.to));
    } catch (error) {
      respondWithSendError(res, error);
    }
  });

  router.get("/webhook", (req, res) => {
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

  router.post("/webhook", (req: RequestWithRawBody, res) => {
    const appSecret = process.env.META_APP_SECRET?.trim();
    const signatureRequired = process.env.META_WEBHOOK_REQUIRED !== "false";

    if (signatureRequired && !appSecret) {
      res.status(503).json({ error: "META_APP_SECRET nao foi configurado." });
      return;
    }
    if (appSecret && !hasValidMetaSignature(req, appSecret)) {
      res.status(401).json({ error: "Assinatura do webhook invalida." });
      return;
    }
    if (!isJsonObject(req.body) || req.body.object !== "whatsapp_business_account") {
      res.status(400).json({ error: "Evento de webhook invalido." });
      return;
    }

    // A Meta espera 200 rapidamente; persistencia e agente continuam em background.
    res.sendStatus(200);
    if (hasPrismaConfig()) {
      void persistWebhookMessages(req.body).catch((error) => {
        console.error("Falha ao salvar evento recebido do WhatsApp:", error);
      });
    }
    if (options.onWebhook) {
      void options.onWebhook(req.body).catch((error) => {
        console.error("Falha ao processar webhook do WhatsApp", error);
      });
    }
  });

  return router;
}

export const whatsappRouter = createWhatsappRouter();

async function sendWhatsAppPayload(messagePayload: JsonObject & { to: string }): Promise<unknown> {
  const to = normalizePhoneNumber(messagePayload.to);
  const apiPayload: JsonObject & { to: string } = { ...messagePayload, to };
  if (!hasPrismaConfig()) return sendCloudMessage(apiPayload);

  const prisma = getPrisma();
  const contact = await prisma.contact.upsert({
    where: { phoneNumber: to },
    update: {},
    create: { phoneNumber: to },
  });
  const storedPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    ...apiPayload,
  };
  const sentMessage = await prisma.sentMessage.create({
    data: {
      contactId: contact.id,
      type: typeof apiPayload.type === "string" ? apiPayload.type : "unknown",
      payload: toJsonValue(storedPayload),
    },
  });

  try {
    const responseBody = await sendCloudMessage(apiPayload);
    await prisma.sentMessage.update({
      where: { id: sentMessage.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        whatsappMessageId: getWhatsAppMessageId(responseBody),
      },
    });
    return responseBody;
  } catch (error) {
    try {
      await prisma.sentMessage.update({ where: { id: sentMessage.id }, data: { status: "FAILED" } });
    } catch (updateError) {
      console.error("Nao foi possivel marcar a mensagem como falha:", updateError);
    }
    throw error;
  }
}

async function persistWebhookMessages(body: JsonObject): Promise<void> {
  for (const { message, contactName } of getWebhookMessages(body)) {
    await saveReceivedMessage(message, contactName);
  }
}

function getWebhookMessages(body: JsonObject): Array<{ message: WebhookMessage; contactName?: string }> {
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
          result.push({ message: message as WebhookMessage, contactName: namesByPhone.get(message.from) });
        }
      }
    }
  }
  return result;
}

async function saveReceivedMessage(message: WebhookMessage, contactName?: string): Promise<void> {
  const prisma = getPrisma();
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
  const contextMessageId = context && typeof context.id === "string" ? context.id : undefined;
  const referencedSentMessage = contextMessageId
    ? await prisma.sentMessage.findFirst({
        where: { contactId: contact.id, whatsappMessageId: contextMessageId },
      })
    : null;
  const sentMessage = referencedSentMessage ?? await prisma.sentMessage.findFirst({
    where: {
      contactId: contact.id,
      status: { in: ["PENDING", "SENT"] },
      createdAt: { lte: receivedAt },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!sentMessage) {
    throw new Error(`Nao existe mensagem enviada para associar a mensagem recebida ${message.id}.`);
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

function respondWithSendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Erro inesperado ao enviar a mensagem.";
  const errorObject = isJsonObject(error) ? error : undefined;
  const status = error instanceof WhatsAppValidationError
    ? 400
    : typeof errorObject?.status === "number" ? errorObject.status : 500;
  res.status(status).json({ error: message, details: errorObject?.details });
}

function normalizePhoneNumber(phoneNumber: string): string {
  const trimmed = phoneNumber.trim();
  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) {
    throw new WhatsAppValidationError("Informe um telefone valido, incluindo o codigo do pais e o DDD.");
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new WhatsAppValidationError("Informe um telefone valido, incluindo o codigo do pais e o DDD.");
  }
  return digits;
}

function parseWhatsAppTimestamp(timestamp: string): Date {
  const seconds = Number(timestamp);
  const date = new Date(seconds * 1_000);
  if (!Number.isFinite(seconds) || Number.isNaN(date.getTime())) {
    throw new WhatsAppValidationError("Timestamp invalido no evento do WhatsApp.");
  }
  return date;
}

function getWhatsAppMessageId(responseBody: unknown): string | undefined {
  if (!isJsonObject(responseBody) || !Array.isArray(responseBody.messages)) return undefined;
  const firstMessage = responseBody.messages[0];
  return isJsonObject(firstMessage) && typeof firstMessage.id === "string" ? firstMessage.id : undefined;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hasValidMetaSignature(req: RequestWithRawBody, appSecret: string): boolean {
  const receivedSignature = req.header("x-hub-signature-256");
  if (!receivedSignature || !req.rawBody) return false;

  const expectedSignature = `sha256=${createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
