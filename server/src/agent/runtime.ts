import { ApifySupplierSearchClient, SupplierSearchService } from "../supplier-search.js";
import { LocalSupplierGateway, McpSupplierGateway, McpToolClient, McpWhatsappGateway } from "./gateways.js";
import { OpenAIQuoteInterpreter, OpenAIRfqIntake } from "./openai-agents.js";
import { SupabaseAgentRepository } from "./repository.js";
import { ProcurementAgentService } from "./service.js";

export function createDefaultAgentService(): ProcurementAgentService {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for agent routes.");
  if (!process.env.WHATSAPP_MCP_URL) throw new Error("WHATSAPP_MCP_URL is required for agent routes.");

  const whatsappClient = new McpToolClient(
    process.env.WHATSAPP_MCP_URL,
    "whatsapp",
    process.env.WHATSAPP_MCP_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_MCP_TOKEN}` } : undefined,
  );
  const whatsappGateway = new McpWhatsappGateway(whatsappClient);
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

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}
