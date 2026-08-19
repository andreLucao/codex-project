import { ApifySupplierSearchClient, SupplierSearchService } from "../supplier-search.js";
import { LocalSupplierGateway, McpSupplierGateway, McpToolClient, McpWhatsappGateway, MetaWhatsappGateway } from "./gateways.js";
import { OpenAIQuoteInterpreter, OpenAIRfqIntake } from "./openai-agents.js";
import { SupabaseAgentRepository } from "./repository.js";
import { ProcurementAgentService } from "./service.js";

export function createDefaultAgentService(): ProcurementAgentService {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for agent routes.");
  if (!hasWhatsappConfig()) throw new Error("WHATSAPP_MCP_URL or Meta WhatsApp credentials are required for agent routes.");

  const whatsappGateway = process.env.WHATSAPP_MCP_URL
    ? new McpWhatsappGateway(new McpToolClient(
        process.env.WHATSAPP_MCP_URL,
        "whatsapp",
        process.env.WHATSAPP_MCP_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_MCP_TOKEN}` } : undefined,
      ))
    : new MetaWhatsappGateway();
  const supplierGateway = process.env.SUPPLIER_MCP_URL
    ? new McpSupplierGateway(new McpToolClient(process.env.SUPPLIER_MCP_URL, "suppliers"))
    : new LocalSupplierGateway(new SupplierSearchService(new ApifySupplierSearchClient()));

  return new ProcurementAgentService({
    repository: SupabaseAgentRepository.fromEnv(),
    intake: new OpenAIRfqIntake(),
    interpreter: new OpenAIQuoteInterpreter(),
    supplierGateway,
    whatsappGateway,
    config: {
      minQuotesToNegotiate: readPositiveInt("MIN_QUOTES_TO_NEGOTIATE", 5),
      minQuotesOnTimeout: readPositiveInt("MIN_QUOTES_ON_TIMEOUT", 2),
      quoteTimeoutSeconds: readPositiveInt("QUOTE_TIMEOUT_SECONDS", 60),
      counterofferTimeoutSeconds: readPositiveInt("COUNTEROFFER_TIMEOUT_SECONDS", 60),
      serviceWindowHours: readPositiveInt("WHATSAPP_SERVICE_WINDOW_HOURS", 24),
    },
  });
}

export function hasAgentRuntimeConfig(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    hasWhatsappConfig(),
  );
}

function hasWhatsappConfig(): boolean {
  return Boolean(
    process.env.WHATSAPP_MCP_URL ||
    (process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_GRAPH_API_VERSION),
  );
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}
