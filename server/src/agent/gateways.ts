import { MCPServerStreamableHttp } from "@openai/agents";
import { SupplierSearchService, type Supplier } from "../supplier-search.js";
import { downloadMetaMedia, extractProviderMessageId, requiredMetaEnv, sendCloudMessage } from "../whatsapp/cloud-api.js";
import type { MediaReference, Rfq, RfqSupplier } from "./types.js";

export interface SupplierGateway {
  search(input: { supplierType: string; location: string; maxResults: number }): Promise<Supplier[]>;
}

export class LocalSupplierGateway implements SupplierGateway {
  constructor(
    private readonly service: SupplierSearchService,
    private readonly pollIntervalMs = 1_000,
    private readonly timeoutMs = 90_000,
  ) {}

  async search(input: { supplierType: string; location: string; maxResults: number }): Promise<Supplier[]> {
    const { runId } = await this.service.start({ supplierType: input.supplierType, location: input.location });
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.service.get(runId);
      if (result.status === "succeeded") return result.suppliers.slice(0, input.maxResults);
      if (result.status === "failed") throw new Error("Supplier search failed.");
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new Error("Supplier search timed out.");
  }
}

export interface WhatsappGateway {
  sendInitialTemplate(input: {
    idempotencyKey: string;
    rfq: Rfq;
    supplier: RfqSupplier;
  }): Promise<{ providerMessageId: string }>;
  sendSessionMessage(input: {
    idempotencyKey: string;
    rfqSupplierId: string;
    to: string;
    text: string;
  }): Promise<{ providerMessageId: string }>;
  requestReengagement(input: {
    idempotencyKey: string;
    rfqSupplierId: string;
    to: string;
    reason: "counteroffer" | "clarification" | "award";
  }): Promise<{ providerMessageId: string }>;
  getMedia(mediaId: string): Promise<MediaReference>;
}

export class McpToolClient {
  private connected = false;
  private readonly server: MCPServerStreamableHttp;

  constructor(url: string, name: string, headers?: Record<string, string>) {
    this.server = new MCPServerStreamableHttp({
      url,
      name,
      cacheToolsList: true,
      requestInit: headers ? { headers } : undefined,
      timeout: Number(process.env.MCP_TIMEOUT_MS ?? 15_000),
    });
  }

  async call<T>(toolName: string, input: Record<string, unknown>): Promise<T> {
    if (!this.connected) {
      await this.server.connect();
      this.connected = true;
    }
    const result = await this.server.callToolResult(toolName, input);
    if (result.isError) throw new Error(readMcpText(result.content) || `MCP tool ${toolName} failed.`);
    if (result.structuredContent) return result.structuredContent as T;
    const text = readMcpText(result.content);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.server.close();
    this.connected = false;
  }
}

export class McpSupplierGateway implements SupplierGateway {
  constructor(private readonly client: McpToolClient) {}

  async search(input: { supplierType: string; location: string; maxResults: number }): Promise<Supplier[]> {
    const result = await this.client.call<{ suppliers: Supplier[] }>("search_suppliers", input);
    return result.suppliers;
  }
}

export class McpWhatsappGateway implements WhatsappGateway {
  constructor(private readonly client: McpToolClient) {}

  sendInitialTemplate(input: { idempotencyKey: string; rfq: Rfq; supplier: RfqSupplier }) {
    return this.client.call<{ providerMessageId: string }>("send_initial_rfq_template", {
      idempotencyKey: input.idempotencyKey,
      rfqSupplierId: input.supplier.id,
      to: input.supplier.phone,
      variables: {
        item: input.rfq.item,
        quantity: String(input.rfq.quantity),
        unit: input.rfq.unit,
        deliveryDeadline: input.rfq.deliveryDeadline,
        deliveryLocation: input.rfq.deliveryLocation,
      },
    });
  }

  sendSessionMessage(input: { idempotencyKey: string; rfqSupplierId: string; to: string; text: string }) {
    return this.client.call<{ providerMessageId: string }>("send_whatsapp_session_message", input);
  }

  requestReengagement(input: {
    idempotencyKey: string;
    rfqSupplierId: string;
    to: string;
    reason: "counteroffer" | "clarification" | "award";
  }) {
    return this.client.call<{ providerMessageId: string }>("request_reengagement_template", input);
  }

  getMedia(mediaId: string) {
    return this.client.call<MediaReference>("get_whatsapp_media", { mediaId });
  }
}

export class MetaWhatsappGateway implements WhatsappGateway {
  async sendInitialTemplate(input: { idempotencyKey: string; rfq: Rfq; supplier: RfqSupplier }) {
    const templateName = requiredMetaEnv("META_INITIAL_RFQ_TEMPLATE_NAME");
    const template = templateName === "hello_world"
      ? { name: templateName, language: { code: "en_US" } }
      : {
          name: templateName,
          language: { code: process.env.META_TEMPLATE_LANGUAGE ?? "pt_BR" },
          components: [{
            type: "body",
            parameters: initialTemplateParameters(templateName, input.rfq),
          }],
        };
    const body = await sendCloudMessage({
      to: outboundPhone(input.supplier.phone),
      type: "template",
      template,
    });
    return { providerMessageId: extractProviderMessageId(body) };
  }

  async sendSessionMessage(input: { idempotencyKey: string; rfqSupplierId: string; to: string; text: string }) {
    const body = await sendCloudMessage({
      to: outboundPhone(input.to),
      type: "text",
      text: { body: input.text, preview_url: false },
    });
    return { providerMessageId: extractProviderMessageId(body) };
  }

  async requestReengagement(input: {
    idempotencyKey: string;
    rfqSupplierId: string;
    to: string;
    reason: "counteroffer" | "clarification" | "award";
  }) {
    const body = await sendCloudMessage({
      to: outboundPhone(input.to),
      type: "template",
      template: {
        name: requiredMetaEnv("META_REENGAGEMENT_TEMPLATE_NAME"),
        language: { code: process.env.META_TEMPLATE_LANGUAGE ?? "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: input.reason }] }],
      },
    });
    return { providerMessageId: extractProviderMessageId(body) };
  }

  async getMedia(mediaId: string): Promise<MediaReference> {
    const media = await downloadMetaMedia(mediaId);
    return { mediaId, ...media };
  }
}

export class RecordingWhatsappGateway implements WhatsappGateway {
  readonly initialTemplates: Array<{ idempotencyKey: string; rfq: Rfq; supplier: RfqSupplier }> = [];
  readonly sessionMessages: Array<{ idempotencyKey: string; rfqSupplierId: string; to: string; text: string }> = [];
  readonly reengagements: Array<{
    idempotencyKey: string;
    rfqSupplierId: string;
    to: string;
    reason: "counteroffer" | "clarification" | "award";
  }> = [];
  readonly media = new Map<string, MediaReference>();

  async sendInitialTemplate(input: { idempotencyKey: string; rfq: Rfq; supplier: RfqSupplier }) {
    this.initialTemplates.push(structuredClone(input));
    return { providerMessageId: `initial-${input.supplier.id}` };
  }

  async sendSessionMessage(input: { idempotencyKey: string; rfqSupplierId: string; to: string; text: string }) {
    this.sessionMessages.push(structuredClone(input));
    return { providerMessageId: `session-${this.sessionMessages.length}` };
  }

  async requestReengagement(input: {
    idempotencyKey: string;
    rfqSupplierId: string;
    to: string;
    reason: "counteroffer" | "clarification" | "award";
  }) {
    this.reengagements.push(structuredClone(input));
    return { providerMessageId: `reengagement-${this.reengagements.length}` };
  }

  async getMedia(mediaId: string): Promise<MediaReference> {
    const media = this.media.get(mediaId);
    if (!media) throw new Error(`Media ${mediaId} not found.`);
    return structuredClone(media);
  }
}

function readMcpText(content: Array<{ type: string; text?: string }>): string {
  return content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function outboundPhone(originalPhone: string): string {
  return normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT?.trim() || originalPhone);
}

function initialTemplateParameters(templateName: string, rfq: Rfq) {
  if (process.env.WHATSAPP_TEST_RECIPIENT && templateName === "resp_simples") {
    return [
      { type: "text", text: process.env.WHATSAPP_TEST_RECIPIENT_NAME ?? "Leonardo" },
      { type: "text", text: "Agente de Compras" },
      { type: "text", text: "Restaurante E2E" },
      { type: "text", text: `cotacao de ${rfq.item}` },
      { type: "text", text: rfq.deliveryLocation },
    ];
  }
  return [
    { type: "text", text: rfq.item },
    { type: "text", text: String(rfq.quantity) },
    { type: "text", text: rfq.unit },
    { type: "text", text: rfq.deliveryDeadline },
    { type: "text", text: rfq.deliveryLocation },
  ];
}
