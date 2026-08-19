type JsonObject = Record<string, unknown>;

export function requiredMetaEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`A variavel de ambiente ${name} nao foi configurada.`);
  return value;
}

export async function sendCloudMessage(messagePayload: JsonObject): Promise<JsonObject> {
  const accessToken = requiredMetaEnv("META_WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requiredMetaEnv("META_WHATSAPP_PHONE_NUMBER_ID");
  const response = await fetch(graphUrl(`${encodeURIComponent(phoneNumberId)}/messages`), {
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
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`A Meta recusou o envio da mensagem (${response.status}).`);
    Object.assign(error, { status: response.status, details: body });
    throw error;
  }
  return isJsonObject(body) ? body : {};
}

export async function downloadMetaMedia(mediaId: string): Promise<{ url: string; mimeType: string }> {
  const accessToken = requiredMetaEnv("META_WHATSAPP_ACCESS_TOKEN");
  const metadataResponse = await fetch(graphUrl(encodeURIComponent(mediaId)), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metadata: unknown = await metadataResponse.json().catch(() => null);
  if (!metadataResponse.ok || !isJsonObject(metadata) || typeof metadata.url !== "string") {
    throw new Error(`Nao foi possivel obter a midia ${mediaId} da Meta.`);
  }
  const mediaResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!mediaResponse.ok) throw new Error(`Nao foi possivel baixar a midia ${mediaId} da Meta.`);
  const mimeType = typeof metadata.mime_type === "string"
    ? metadata.mime_type
    : (mediaResponse.headers.get("content-type") ?? "application/octet-stream");
  const base64 = Buffer.from(await mediaResponse.arrayBuffer()).toString("base64");
  return { url: `data:${mimeType};base64,${base64}`, mimeType };
}

export function extractProviderMessageId(body: JsonObject): string {
  const messages = body.messages;
  if (!Array.isArray(messages) || !isJsonObject(messages[0]) || typeof messages[0].id !== "string") {
    throw new Error("A resposta da Meta nao trouxe o ID da mensagem.");
  }
  return messages[0].id;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphUrl(path: string): string {
  const version = requiredMetaEnv("META_GRAPH_API_VERSION");
  const baseUrl = (process.env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com").replace(/\/$/, "");
  return `${baseUrl}/${version}/${path}`;
}
