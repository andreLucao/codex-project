import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  NegotiationRound,
  Quote,
  RestaurantProfile,
  Rfq,
  RfqSupplier,
  RfqView,
  StoredMessage,
} from "./types.js";

export interface AgentRepository {
  getRestaurantProfile(restaurantId: string): Promise<RestaurantProfile | null>;
  createRfq(rfq: Rfq): Promise<Rfq>;
  getRfq(rfqId: string): Promise<Rfq | null>;
  listActiveRfqs(): Promise<Rfq[]>;
  updateRfq(rfqId: string, changes: Partial<Rfq>): Promise<Rfq>;
  addSupplier(supplier: RfqSupplier): Promise<RfqSupplier>;
  getSupplier(supplierId: string): Promise<RfqSupplier | null>;
  listSuppliers(rfqId: string): Promise<RfqSupplier[]>;
  updateSupplier(supplierId: string, changes: Partial<RfqSupplier>): Promise<RfqSupplier>;
  recordMessageIfNew(message: StoredMessage): Promise<boolean>;
  addQuote(quote: Quote): Promise<Quote>;
  listQuotes(rfqId: string): Promise<Quote[]>;
  getQuote(quoteId: string): Promise<Quote | null>;
  tryCreateNegotiationRound(round: NegotiationRound): Promise<NegotiationRound | null>;
  getNegotiationRound(rfqId: string): Promise<NegotiationRound | null>;
  updateNegotiationRound(roundId: string, changes: Partial<NegotiationRound>): Promise<NegotiationRound>;
  getRfqView(rfqId: string): Promise<RfqView | null>;
}

export class InMemoryAgentRepository implements AgentRepository {
  private profiles = new Map<string, RestaurantProfile>();
  private rfqs = new Map<string, Rfq>();
  private suppliers = new Map<string, RfqSupplier>();
  private messages = new Map<string, StoredMessage>();
  private quotes = new Map<string, Quote>();
  private rounds = new Map<string, NegotiationRound>();

  seedProfile(profile: RestaurantProfile): void {
    this.profiles.set(profile.id, structuredClone(profile));
  }

  async getRestaurantProfile(restaurantId: string): Promise<RestaurantProfile | null> {
    return cloneOrNull(this.profiles.get(restaurantId));
  }

  async createRfq(rfq: Rfq): Promise<Rfq> {
    const duplicate = [...this.rfqs.values()].find((item) => item.requestId === rfq.requestId);
    if (duplicate) return structuredClone(duplicate);
    this.rfqs.set(rfq.id, structuredClone(rfq));
    return structuredClone(rfq);
  }

  async getRfq(rfqId: string): Promise<Rfq | null> {
    return cloneOrNull(this.rfqs.get(rfqId));
  }

  async listActiveRfqs(): Promise<Rfq[]> {
    return [...this.rfqs.values()]
      .filter((item) => item.status === "collecting" || item.status === "negotiating")
      .map((item) => structuredClone(item));
  }

  async updateRfq(rfqId: string, changes: Partial<Rfq>): Promise<Rfq> {
    const current = required(this.rfqs.get(rfqId), `RFQ ${rfqId} not found.`);
    const updated = { ...current, ...structuredClone(changes), id: current.id };
    this.rfqs.set(rfqId, updated);
    return structuredClone(updated);
  }

  async addSupplier(supplier: RfqSupplier): Promise<RfqSupplier> {
    this.suppliers.set(supplier.id, structuredClone(supplier));
    return structuredClone(supplier);
  }

  async getSupplier(supplierId: string): Promise<RfqSupplier | null> {
    return cloneOrNull(this.suppliers.get(supplierId));
  }

  async listSuppliers(rfqId: string): Promise<RfqSupplier[]> {
    return [...this.suppliers.values()].filter((item) => item.rfqId === rfqId).map((item) => structuredClone(item));
  }

  async updateSupplier(supplierId: string, changes: Partial<RfqSupplier>): Promise<RfqSupplier> {
    const current = required(this.suppliers.get(supplierId), `Supplier ${supplierId} not found.`);
    const updated = { ...current, ...structuredClone(changes), id: current.id };
    this.suppliers.set(supplierId, updated);
    return structuredClone(updated);
  }

  async recordMessageIfNew(message: StoredMessage): Promise<boolean> {
    const key = message.providerMessageId ?? message.idempotencyKey ?? message.id;
    if (this.messages.has(key)) return false;
    this.messages.set(key, structuredClone(message));
    return true;
  }

  async addQuote(quote: Quote): Promise<Quote> {
    this.quotes.set(quote.id, structuredClone(quote));
    return structuredClone(quote);
  }

  async listQuotes(rfqId: string): Promise<Quote[]> {
    return [...this.quotes.values()].filter((item) => item.rfqId === rfqId).map((item) => structuredClone(item));
  }

  async getQuote(quoteId: string): Promise<Quote | null> {
    return cloneOrNull(this.quotes.get(quoteId));
  }

  async tryCreateNegotiationRound(round: NegotiationRound): Promise<NegotiationRound | null> {
    if ([...this.rounds.values()].some((item) => item.rfqId === round.rfqId)) return null;
    this.rounds.set(round.id, structuredClone(round));
    return structuredClone(round);
  }

  async getNegotiationRound(rfqId: string): Promise<NegotiationRound | null> {
    return cloneOrNull([...this.rounds.values()].find((item) => item.rfqId === rfqId));
  }

  async updateNegotiationRound(roundId: string, changes: Partial<NegotiationRound>): Promise<NegotiationRound> {
    const current = required(this.rounds.get(roundId), `Negotiation round ${roundId} not found.`);
    const updated = { ...current, ...structuredClone(changes), id: current.id };
    this.rounds.set(roundId, updated);
    return structuredClone(updated);
  }

  async getRfqView(rfqId: string): Promise<RfqView | null> {
    const rfq = await this.getRfq(rfqId);
    if (!rfq) return null;
    return {
      rfq,
      suppliers: await this.listSuppliers(rfqId),
      quotes: await this.listQuotes(rfqId),
      negotiationRound: await this.getNegotiationRound(rfqId),
    };
  }
}

export class SupabaseAgentRepository implements AgentRepository {
  constructor(private readonly client: SupabaseClient, private readonly restaurantTable = "restaurants") {}

  static fromEnv(): SupabaseAgentRepository {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    return new SupabaseAgentRepository(createClient(url, serviceKey, { auth: { persistSession: false } }), process.env.RESTAURANTS_TABLE);
  }

  async getRestaurantProfile(restaurantId: string): Promise<RestaurantProfile | null> {
    const { data, error } = await this.client.from(this.restaurantTable).select("id,name,location").eq("id", restaurantId).maybeSingle();
    if (error) throw error;
    return data ? { id: String(data.id), name: String(data.name), location: String(data.location) } : null;
  }

  async createRfq(rfq: Rfq): Promise<Rfq> {
    const { data, error } = await this.client.from("rfqs").insert(toSnake(rfq)).select().single();
    if (!error) return fromRfqRow(data);
    if (error.code !== "23505") throw error;
    const existing = await this.client.from("rfqs").select().eq("request_id", rfq.requestId).single();
    if (existing.error) throw existing.error;
    return fromRfqRow(existing.data);
  }

  async getRfq(rfqId: string): Promise<Rfq | null> {
    const { data, error } = await this.client.from("rfqs").select().eq("id", rfqId).maybeSingle();
    if (error) throw error;
    return data ? fromRfqRow(data) : null;
  }

  async listActiveRfqs(): Promise<Rfq[]> {
    const { data, error } = await this.client.from("rfqs").select().in("status", ["collecting", "negotiating"]);
    if (error) throw error;
    return (data ?? []).map(fromRfqRow);
  }

  async updateRfq(rfqId: string, changes: Partial<Rfq>): Promise<Rfq> {
    const { data, error } = await this.client.from("rfqs").update(toSnake(changes)).eq("id", rfqId).select().single();
    if (error) throw error;
    return fromRfqRow(data);
  }

  async addSupplier(supplier: RfqSupplier): Promise<RfqSupplier> {
    const { data, error } = await this.client.from("rfq_suppliers").insert(toSnake(supplier)).select().single();
    if (error) throw error;
    return fromSupplierRow(data);
  }

  async getSupplier(supplierId: string): Promise<RfqSupplier | null> {
    const { data, error } = await this.client.from("rfq_suppliers").select().eq("id", supplierId).maybeSingle();
    if (error) throw error;
    return data ? fromSupplierRow(data) : null;
  }

  async listSuppliers(rfqId: string): Promise<RfqSupplier[]> {
    const { data, error } = await this.client.from("rfq_suppliers").select().eq("rfq_id", rfqId).order("created_at");
    if (error) throw error;
    return (data ?? []).map(fromSupplierRow);
  }

  async updateSupplier(supplierId: string, changes: Partial<RfqSupplier>): Promise<RfqSupplier> {
    const { data, error } = await this.client.from("rfq_suppliers").update(toSnake(changes)).eq("id", supplierId).select().single();
    if (error) throw error;
    return fromSupplierRow(data);
  }

  async recordMessageIfNew(message: StoredMessage): Promise<boolean> {
    const { error } = await this.client.from("agent_messages").insert(toSnake(message));
    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  }

  async addQuote(quote: Quote): Promise<Quote> {
    const { data, error } = await this.client.from("quotes").insert(toSnake(quote)).select().single();
    if (error) throw error;
    return fromQuoteRow(data);
  }

  async listQuotes(rfqId: string): Promise<Quote[]> {
    const { data, error } = await this.client.from("quotes").select().eq("rfq_id", rfqId).order("created_at");
    if (error) throw error;
    return (data ?? []).map(fromQuoteRow);
  }

  async getQuote(quoteId: string): Promise<Quote | null> {
    const { data, error } = await this.client.from("quotes").select().eq("id", quoteId).maybeSingle();
    if (error) throw error;
    return data ? fromQuoteRow(data) : null;
  }

  async tryCreateNegotiationRound(round: NegotiationRound): Promise<NegotiationRound | null> {
    const { data, error } = await this.client.from("negotiation_rounds").insert(toSnake(round)).select().single();
    if (error?.code === "23505") return null;
    if (error) throw error;
    return fromRoundRow(data);
  }

  async getNegotiationRound(rfqId: string): Promise<NegotiationRound | null> {
    const { data, error } = await this.client.from("negotiation_rounds").select().eq("rfq_id", rfqId).maybeSingle();
    if (error) throw error;
    return data ? fromRoundRow(data) : null;
  }

  async updateNegotiationRound(roundId: string, changes: Partial<NegotiationRound>): Promise<NegotiationRound> {
    const { data, error } = await this.client.from("negotiation_rounds").update(toSnake(changes)).eq("id", roundId).select().single();
    if (error) throw error;
    return fromRoundRow(data);
  }

  async getRfqView(rfqId: string): Promise<RfqView | null> {
    const rfq = await this.getRfq(rfqId);
    if (!rfq) return null;
    const [suppliers, quotes, negotiationRound] = await Promise.all([
      this.listSuppliers(rfqId),
      this.listQuotes(rfqId),
      this.getNegotiationRound(rfqId),
    ]);
    return { rfq, suppliers, quotes, negotiationRound };
  }
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function cloneOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}

function toSnake(value: Record<string, unknown>): Record<string, unknown>;
function toSnake<T extends object>(value: T): Record<string, unknown>;
function toSnake(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), item]));
}

function camelRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()), value]));
}

const fromRfqRow = (row: Record<string, unknown>): Rfq => {
  const rfq = camelRow(row) as unknown as Rfq;
  return {
    ...rfq,
    quantity: Number(rfq.quantity),
    minQuotesToNegotiate: Number(rfq.minQuotesToNegotiate),
    minQuotesOnTimeout: Number(rfq.minQuotesOnTimeout),
    counterofferTimeoutSeconds: Number(rfq.counterofferTimeoutSeconds),
  };
};
const fromSupplierRow = (row: Record<string, unknown>): RfqSupplier => {
  const supplier = camelRow(row) as unknown as RfqSupplier;
  return { ...supplier, rating: supplier.rating === null ? null : Number(supplier.rating), clarificationCount: Number(supplier.clarificationCount) };
};
const fromQuoteRow = (row: Record<string, unknown>): Quote => {
  const quote = camelRow(row) as unknown as Quote;
  return {
    ...quote,
    deliveredUnitPrice: quote.deliveredUnitPrice === null ? null : Number(quote.deliveredUnitPrice),
    deliveredTotal: quote.deliveredTotal === null ? null : Number(quote.deliveredTotal),
    priceAmount: quote.priceAmount === null ? null : Number(quote.priceAmount),
    priceQuantity: quote.priceQuantity === null ? null : Number(quote.priceQuantity),
    freightAmount: quote.freightAmount === null ? null : Number(quote.freightAmount),
    confidence: Number(quote.confidence),
  };
};
const fromRoundRow = (row: Record<string, unknown>): NegotiationRound => {
  const round = camelRow(row) as unknown as NegotiationRound;
  return { ...round, anchorUnitPrice: Number(round.anchorUnitPrice) };
};
