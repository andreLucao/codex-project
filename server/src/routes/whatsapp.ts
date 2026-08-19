import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { isJsonObject, sendCloudMessage } from "../whatsapp/cloud-api.js";

export type RequestWithRawBody = Request & { rawBody?: Buffer };
type JsonObject = Record<string, unknown>;

class WhatsAppValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppValidationError";
  }
}

/** Inicia uma conversa usando o template de teste aprovado pela Meta. */
export async function sendFirstMessage(to: string): Promise<unknown> {
  return sendCloudMessage({
    to: normalizePhoneNumber(to),
    type: "template",
    template: {
      name: "hello_world",
      language: { code: "en_US" },
    },
  });
}

/** Envia texto livre durante a janela de atendimento de 24 horas. */
export async function sendMessage(to: string, message: string, previewUrl = false): Promise<unknown> {
  if (!message.trim()) throw new WhatsAppValidationError("A mensagem nao pode estar vazia.");
  return sendCloudMessage({
    to: normalizePhoneNumber(to),
    type: "text",
    text: { body: message, preview_url: previewUrl },
  });
}

export function createWhatsappRouter(options: { onWebhook?: (body: JsonObject) => Promise<void> } = {}) {
  const router = Router();

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
        : await sendCloudMessage({ ...officialMessage, to: normalizePhoneNumber(to) });
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

    // A Meta espera 200 rapidamente; o agente processa o evento em background.
    res.sendStatus(200);
    if (options.onWebhook) {
      void options.onWebhook(req.body).catch((error) => console.error("Falha ao processar webhook do WhatsApp", error));
    }
  });

  return router;
}

export const whatsappRouter = createWhatsappRouter();

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

function hasValidMetaSignature(req: RequestWithRawBody, appSecret: string): boolean {
  const receivedSignature = req.header("x-hub-signature-256");
  if (!receivedSignature || !req.rawBody) return false;

  const expectedSignature = `sha256=${createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
