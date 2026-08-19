import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";

export type RequestWithRawBody = Request & { rawBody?: Buffer };

type JsonObject = Record<string, unknown>;

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

  let messagePayload: JsonObject;

  if (typeof message === "string" && message.trim()) {
    messagePayload = {
      to: to.trim(),
      type: "text",
      text: {
        body: message,
        preview_url: previewUrl === true,
      },
    };
  } else {
    if (typeof officialMessage.type !== "string") {
      res.status(400).json({
        error: "Informe 'message' para texto simples ou um payload oficial com o campo 'type'.",
      });
      return;
    }

    messagePayload = { ...officialMessage, to: to.trim() };
  }

  try {
    const accessToken = requiredEnv("META_WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = requiredEnv("META_WHATSAPP_PHONE_NUMBER_ID");
    const graphApiVersion = requiredEnv("META_GRAPH_API_VERSION");
    const graphApiBaseUrl = (
      process.env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com"
    ).replace(/\/$/, "");

    const metaResponse = await fetch(
      `${graphApiBaseUrl}/${graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...messagePayload,
        }),
      },
    );

    const responseBody: unknown = await metaResponse.json().catch(() => null);

    if (!metaResponse.ok) {
      res.status(metaResponse.status).json({
        error: "A Meta recusou o envio da mensagem.",
        details: responseBody,
      });
      return;
    }

    res.status(200).json(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao enviar a mensagem.";
    res.status(500).json({ error: message });
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

/** Recebe notificacoes de mensagens, status e demais eventos do WhatsApp. */
whatsappRouter.post("/webhook", (req: RequestWithRawBody, res) => {
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (appSecret && !hasValidMetaSignature(req, appSecret)) {
    res.status(401).json({ error: "Assinatura do webhook invalida." });
    return;
  }

  if (!isJsonObject(req.body) || req.body.object !== "whatsapp_business_account") {
    res.status(400).json({ error: "Evento de webhook invalido." });
    return;
  }

  // Substitua este log por uma fila ou pelo processamento da sua aplicacao.
  console.info("Evento recebido do WhatsApp:", JSON.stringify(req.body));

  // A Meta espera uma resposta 200 rapida para considerar o evento entregue.
  res.sendStatus(200);
});
