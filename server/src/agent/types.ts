export type RfqStatus =
  | "collecting"
  | "negotiating"
  | "awaiting_approval"
  | "awaiting_confirmation"
  | "awarded"
  | "insufficient_quotes"
  | "failed";

export type SupplierThreadStatus =
  | "awaiting_first_reply"
  | "window_open"
  | "clarification_needed"
  | "counteroffered"
  | "counter_replied"
  | "awaiting_reengagement"
  | "human_escalation"
  | "opted_out"
  | "awarded";

export type MessageKind = "text" | "audio" | "image";
export type QuoteRound = "initial" | "counteroffer";

export interface RestaurantProfile {
  id: string;
  name: string;
  location: string;
}

export interface RfqDraft {
  item: string;
  supplierType: string;
  quantity: number | null;
  unit: string | null;
  deliveryDeadline: string | null;
  notes: string | null;
  missingFields: Array<"item" | "quantity" | "unit" | "deliveryDeadline">;
}

export interface Rfq {
  id: string;
  requestId: string;
  restaurantId: string;
  rawRequest: string;
  item: string;
  supplierType: string;
  quantity: number;
  unit: string;
  deliveryDeadline: string;
  deliveryLocation: string;
  notes: string | null;
  status: RfqStatus;
  minQuotesToNegotiate: number;
  minQuotesOnTimeout: number;
  quoteTimeoutAt: string;
  counterofferTimeoutSeconds: number;
  recommendedQuoteId: string | null;
  approvedQuoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RfqSupplier {
  id: string;
  rfqId: string;
  externalSupplierId: string;
  name: string;
  phone: string;
  rating: number | null;
  status: SupplierThreadStatus;
  conversationId: string | null;
  providerInitialMessageId: string | null;
  lastSupplierMessageAt: string | null;
  serviceWindowExpiresAt: string | null;
  clarificationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaReference {
  mediaId?: string;
  url?: string;
  mimeType: string;
}

export interface WhatsappInboundEvent {
  eventId: string;
  providerMessageId: string;
  restaurantId: string;
  rfqId: string;
  rfqSupplierId: string;
  supplierPhone: string;
  type: MessageKind;
  text?: string;
  media?: MediaReference;
  receivedAt: string;
}

export interface StoredMessage {
  id: string;
  providerMessageId: string | null;
  idempotencyKey: string | null;
  rfqId: string;
  rfqSupplierId: string;
  direction: "inbound" | "outbound";
  type: MessageKind;
  body: string | null;
  mediaId: string | null;
  mimeType: string | null;
  createdAt: string;
}

export interface QuoteExtraction {
  intent: "quote" | "counter_accept" | "counter_decline" | "question" | "opt_out" | "human_help" | "other";
  itemMatches: boolean;
  priceAmount: number | null;
  currency: "BRL" | "other" | null;
  priceQuantity: number | null;
  priceUnit: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  freightAmount: number | null;
  freightIncluded: boolean | null;
  deliveryDeadline: string | null;
  confidence: number;
  missingFields: string[];
  evidence: string;
}

export interface NormalizedQuote {
  comparable: boolean;
  deliveredUnitPrice: number | null;
  deliveredTotal: number | null;
  normalizedUnit: string;
  reason: string | null;
}

export interface Quote extends NormalizedQuote {
  id: string;
  rfqId: string;
  rfqSupplierId: string;
  sourceMessageId: string;
  round: QuoteRound;
  priceAmount: number | null;
  priceQuantity: number | null;
  priceUnit: string | null;
  freightAmount: number | null;
  freightIncluded: boolean | null;
  deliveryDeadline: string | null;
  confidence: number;
  evidence: string;
  createdAt: string;
}

export interface NegotiationRound {
  id: string;
  rfqId: string;
  anchorQuoteId: string;
  anchorUnitPrice: number;
  normalizedUnit: string;
  targetSupplierIds: string[];
  respondedSupplierIds: string[];
  trigger: "threshold" | "timeout";
  status: "open" | "closed";
  closesAt: string;
  createdAt: string;
  closedAt: string | null;
}

export interface RfqView {
  rfq: Rfq;
  suppliers: RfqSupplier[];
  quotes: Quote[];
  negotiationRound: NegotiationRound | null;
}

export interface AgentConfig {
  maxSuppliersPerRfq: number;
  minQuotesToNegotiate: number;
  minQuotesOnTimeout: number;
  quoteTimeoutSeconds: number;
  counterofferTimeoutSeconds: number;
  serviceWindowHours: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxSuppliersPerRfq: 10,
  minQuotesToNegotiate: 5,
  minQuotesOnTimeout: 2,
  quoteTimeoutSeconds: 60,
  counterofferTimeoutSeconds: 60,
  serviceWindowHours: 24,
};
