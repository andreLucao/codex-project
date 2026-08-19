import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { isJsonObject, sendCloudMessage } from "../whatsapp/cloud-api.js";

export type RequestWithRawBody = Request & { rawBody?: Buffer };
type JsonObject = Record<string, unknown>;

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

    let messagePayload: JsonObject;
    if (typeof message === "string" && message.trim()) {
      messagePayload = {
        to: to.trim(),
        type: "text",
        text: { body: message, preview_url: previewUrl === true },
      };
    } else {
      if (typeof officialMessage.type !== "string") {
        res.status(400).json({ error: "Informe 'message' para texto simples ou um payload oficial com o campo 'type'." });
        return;
      }
      messagePayload = { ...officialMessage, to: to.trim() };
    }

    try {
      res.status(200).json(await sendCloudMessage(messagePayload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado ao enviar a mensagem.";
      const status = isJsonObject(error) && typeof error.status === "number" ? error.status : 500;
      const details = isJsonObject(error) ? error.details : undefined;
      res.status(status).json({ error: message, details });
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

    // A Meta espera 200 rapidamente; o processamento do agente continua em background.
    res.sendStatus(200);
    if (options.onWebhook) {
      void options.onWebhook(req.body).catch((error) => console.error("Falha ao processar webhook do WhatsApp", error));
    }
  });

  return router;
}

export const whatsappRouter = createWhatsappRouter();

function hasValidMetaSignature(req: RequestWithRawBody, appSecret: string): boolean {
  const receivedSignature = req.header("x-hub-signature-256");
  if (!receivedSignature || !req.rawBody) return false;

  const expectedSignature = `sha256=${createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
