import { ApifySupplierSearchClient, SupplierSearchService } from "../supplier-search.js";
import { LocalSupplierGateway, MetaWhatsappGateway } from "./gateways.js";
import { OpenAIQuoteInterpreter, OpenAIRfqIntake } from "./openai-agents.js";
import { SupabaseAgentRepository } from "./repository.js";
import { ProcurementAgentService } from "./service.js";

export function createDefaultAgentService(): ProcurementAgentService {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for agent routes.");
  if (!process.env.APIFY_TOKEN) throw new Error("APIFY_TOKEN is required for supplier discovery.");
  if (!hasMetaWhatsappConfig()) throw new Error("Meta WhatsApp credentials are required for agent routes.");

  // Composition point for the merged branches: supplier discovery stays on the
  // Apify implementation and every outbound/media action uses the direct Meta
  // WhatsApp integration. The agent only orchestrates those two boundaries.
  const whatsappGateway = new MetaWhatsappGateway();
  const supplierGateway = new LocalSupplierGateway(new SupplierSearchService(new ApifySupplierSearchClient()));

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
    process.env.APIFY_TOKEN &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    hasMetaWhatsappConfig(),
  );
}

function hasMetaWhatsappConfig(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
    process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
    process.env.META_GRAPH_API_VERSION &&
    process.env.META_INITIAL_RFQ_TEMPLATE_NAME &&
    process.env.META_REENGAGEMENT_TEMPLATE_NAME,
  );
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}
