import { randomUUID } from "node:crypto";
import type { Supplier } from "../supplier-search.js";
import { formatMoney, normalizeQuote } from "./normalization.js";
import { parseMetaInboundMessages } from "./meta-webhook.js";
import type { SupplierGateway, WhatsappGateway } from "./gateways.js";
import type { QuoteInterpreter, RfqIntake } from "./openai-agents.js";
import type { AgentRepository } from "./repository.js";
import {
  DEFAULT_AGENT_CONFIG,
  type AgentConfig,
  type NegotiationRound,
  type Quote,
  type Rfq,
  type RfqSupplier,
  type RfqView,
  type StoredMessage,
  type WhatsappInboundEvent,
} from "./types.js";

export class AgentValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "AgentValidationError";
  }
}

export class AgentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentNotFoundError";
  }
}

export interface ProcurementAgentDependencies {
  repository: AgentRepository;
  intake: RfqIntake;
  interpreter: QuoteInterpreter;
  supplierGateway: SupplierGateway;
  whatsappGateway: WhatsappGateway;
  config?: Partial<AgentConfig>;
  now?: () => Date;
}

export class ProcurementAgentService {
  private readonly config: AgentConfig;
  private readonly now: () => Date;

  constructor(private readonly dependencies: ProcurementAgentDependencies) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...dependencies.config };
    this.now = dependencies.now ?? (() => new Date());
  }

  async createRfq(input: { requestId: string; restaurantId: string; message: string }): Promise<RfqView> {
    if (!input.requestId.trim() || !input.restaurantId.trim() || !input.message.trim()) {
      throw new AgentValidationError("requestId, restaurantId and message are required.");
    }
    const profile = await this.dependencies.repository.getRestaurantProfile(input.restaurantId);
    if (!profile?.location) throw new AgentValidationError("Restaurant profile with location was not found.");

    const draft = await this.dependencies.intake.extract(input.message, profile.location);
    if (draft.missingFields.length || draft.quantity === null || !draft.unit || !draft.deliveryDeadline || !draft.item) {
      throw new AgentValidationError("RFQ is missing required information.", { missingFields: draft.missingFields });
    }

    const now = this.now();
    const rfq: Rfq = {
      id: randomUUID(),
      requestId: input.requestId,
      restaurantId: input.restaurantId,
      rawRequest: input.message,
      item: draft.item,
      supplierType: draft.supplierType,
      quantity: draft.quantity,
      unit: draft.unit,
      deliveryDeadline: draft.deliveryDeadline,
      deliveryLocation: profile.location,
      notes: draft.notes,
      status: "collecting",
      minQuotesToNegotiate: this.config.minQuotesToNegotiate,
      minQuotesOnTimeout: this.config.minQuotesOnTimeout,
      quoteTimeoutAt: addSeconds(now, this.config.quoteTimeoutSeconds).toISOString(),
      counterofferTimeoutSeconds: this.config.counterofferTimeoutSeconds,
      recommendedQuoteId: null,
      approvedQuoteId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const persisted = await this.dependencies.repository.createRfq(rfq);
    if (persisted.id !== rfq.id) return requiredView(await this.dependencies.repository.getRfqView(persisted.id));

    try {
      const suppliers = await this.dependencies.supplierGateway.search({
        supplierType: draft.supplierType,
        location: profile.location,
        maxResults: this.config.maxSuppliersPerRfq,
      });
      await this.inviteSuppliers(rfq, suppliers);
    } catch (error) {
      await this.dependencies.repository.updateRfq(rfq.id, { status: "failed", updatedAt: this.now().toISOString() });
      throw error;
    }
    return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
  }

  async handleInbound(event: WhatsappInboundEvent): Promise<RfqView> {
    validateInbound(event);
    const [rfq, supplier] = await Promise.all([
      this.dependencies.repository.getRfq(event.rfqId),
      this.dependencies.repository.getSupplier(event.rfqSupplierId),
    ]);
    if (!rfq) throw new AgentNotFoundError("RFQ not found.");
    if (rfq.restaurantId !== event.restaurantId || !supplier || supplier.rfqId !== rfq.id || supplier.phone !== event.supplierPhone) {
      throw new AgentValidationError("Inbound event does not match the RFQ supplier thread.");
    }

    const message: StoredMessage = {
      id: randomUUID(),
      providerMessageId: event.providerMessageId,
      idempotencyKey: null,
      rfqId: rfq.id,
      rfqSupplierId: supplier.id,
      direction: "inbound",
      type: event.type,
      body: event.text ?? null,
      mediaId: event.media?.mediaId ?? null,
      mimeType: event.media?.mimeType ?? null,
      createdAt: event.receivedAt,
    };
    const isNew = await this.dependencies.repository.recordMessageIfNew(message);
    if (!isNew) return requiredView(await this.dependencies.repository.getRfqView(rfq.id));

    const receivedAt = new Date(event.receivedAt);
    const openSupplier = await this.dependencies.repository.updateSupplier(supplier.id, {
      status: "window_open",
      lastSupplierMessageAt: receivedAt.toISOString(),
      serviceWindowExpiresAt: addHours(receivedAt, this.config.serviceWindowHours).toISOString(),
      updatedAt: this.now().toISOString(),
    });
    if (rfq.status === "awaiting_confirmation" && rfq.approvedQuoteId) {
      const approvedQuote = await this.dependencies.repository.getQuote(rfq.approvedQuoteId);
      if (approvedQuote?.rfqSupplierId === supplier.id) {
        const text = buildAwardMessage(rfq, approvedQuote);
        const outcome = await this.sendWithinWindowOrReengage(rfq, openSupplier, `award-resume:${rfq.id}:${supplier.id}`, text, "award");
        if (outcome === "sent") {
          const now = this.now().toISOString();
          await Promise.all([
            this.dependencies.repository.updateRfq(rfq.id, { status: "awarded", updatedAt: now }),
            this.dependencies.repository.updateSupplier(supplier.id, { status: "awarded", updatedAt: now }),
          ]);
          return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
        }
      }
    }
    const round = await this.dependencies.repository.getNegotiationRound(rfq.id);
    const isCounterReply = Boolean(round?.status === "open" && round.targetSupplierIds.includes(supplier.id));
    const media = await this.resolveMedia(event);
    const interpreted = await this.dependencies.interpreter.interpret({
      rfq,
      supplier: openSupplier,
      text: event.text,
      media,
      round: isCounterReply ? "counteroffer" : "initial",
      anchorUnitPrice: isCounterReply ? round!.anchorUnitPrice : undefined,
      conversationId: openSupplier.conversationId,
    });
    if (interpreted.conversationId !== openSupplier.conversationId) {
      await this.dependencies.repository.updateSupplier(supplier.id, {
        conversationId: interpreted.conversationId,
        updatedAt: this.now().toISOString(),
      });
    }

    const extraction = interpreted.extraction;
    if (extraction.intent === "opt_out") {
      await this.dependencies.repository.updateSupplier(supplier.id, { status: "opted_out", updatedAt: this.now().toISOString() });
      return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
    }
    if (extraction.intent === "human_help") {
      await this.dependencies.repository.updateSupplier(supplier.id, { status: "human_escalation", updatedAt: this.now().toISOString() });
      return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
    }
    if (isCounterReply && extraction.intent === "counter_decline") {
      await this.markCounterResponse(rfq, round!, supplier.id);
      return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
    }
    if (!['quote', 'counter_accept'].includes(extraction.intent)) {
      return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
    }

    const normalized = normalizeQuote(rfq, extraction, isCounterReply ? round!.anchorUnitPrice : undefined);
    const quote: Quote = {
      id: randomUUID(),
      rfqId: rfq.id,
      rfqSupplierId: supplier.id,
      sourceMessageId: message.id,
      round: isCounterReply ? "counteroffer" : "initial",
      priceAmount: extraction.priceAmount,
      priceQuantity: extraction.priceQuantity,
      priceUnit: extraction.priceUnit,
      freightAmount: extraction.freightAmount,
      freightIncluded: extraction.freightIncluded,
      deliveryDeadline: extraction.deliveryDeadline,
      confidence: extraction.confidence,
      evidence: extraction.evidence,
      createdAt: this.now().toISOString(),
      ...normalized,
    };
    await this.dependencies.repository.addQuote(quote);

    if (!quote.comparable) {
      await this.requestClarification(rfq, openSupplier, quote.reason ?? "Dados insuficientes.");
    } else if (isCounterReply) {
      await this.markCounterResponse(rfq, round!, supplier.id);
    } else {
      await this.dependencies.repository.updateSupplier(supplier.id, { status: "window_open", updatedAt: this.now().toISOString() });
      await this.maybeStartNegotiation(rfq, "threshold");
    }

    await this.updateRecommendation(rfq.id);
    return requiredView(await this.dependencies.repository.getRfqView(rfq.id));
  }

  async handleMetaWebhook(payload: Record<string, unknown>): Promise<number> {
    const messages = parseMetaInboundMessages(payload);
    let processed = 0;
    for (const message of messages) {
      const supplier = await this.dependencies.repository.findSupplierForInbound(message.supplierPhone, message.contextMessageId);
      if (!supplier) {
        console.warn("Ignoring unmatched WhatsApp message", { providerMessageId: message.providerMessageId });
        continue;
      }
      const rfq = await this.dependencies.repository.getRfq(supplier.rfqId);
      if (!rfq) continue;
      await this.handleInbound({
        eventId: message.providerMessageId,
        providerMessageId: message.providerMessageId,
        restaurantId: rfq.restaurantId,
        rfqId: rfq.id,
        rfqSupplierId: supplier.id,
        supplierPhone: supplier.phone,
        type: message.type,
        text: message.text,
        media: message.mediaId && message.mimeType
          ? { mediaId: message.mediaId, mimeType: message.mimeType }
          : undefined,
        receivedAt: message.receivedAt,
      });
      processed += 1;
    }
    return processed;
  }

  async approve(rfqId: string, quoteId: string, requestId: string): Promise<RfqView> {
    if (!requestId.trim()) throw new AgentValidationError("requestId is required.");
    const [rfq, quote] = await Promise.all([
      this.dependencies.repository.getRfq(rfqId),
      this.dependencies.repository.getQuote(quoteId),
    ]);
    if (!rfq || !quote || quote.rfqId !== rfqId || !quote.comparable) throw new AgentValidationError("A comparable quote from this RFQ is required.");
    if ((rfq.status === "awarded" || rfq.status === "awaiting_confirmation") && rfq.approvedQuoteId === quoteId) {
      return requiredView(await this.dependencies.repository.getRfqView(rfqId));
    }
    if (rfq.status !== "awaiting_approval") throw new AgentValidationError("The negotiation round must be closed before approval.");
    const supplier = await this.dependencies.repository.getSupplier(quote.rfqSupplierId);
    if (!supplier) throw new AgentNotFoundError("Winning supplier was not found.");

    const idempotencyKey = `award:${rfqId}:${requestId}`;
    const text = buildAwardMessage(rfq, quote);
    const outcome = await this.sendWithinWindowOrReengage(rfq, supplier, idempotencyKey, text, "award");
    const now = this.now().toISOString();
    await this.dependencies.repository.updateRfq(rfqId, {
      status: outcome === "sent" ? "awarded" : "awaiting_confirmation",
      approvedQuoteId: quote.id,
      recommendedQuoteId: quote.id,
      updatedAt: now,
    });
    if (outcome === "sent") await this.dependencies.repository.updateSupplier(supplier.id, { status: "awarded", updatedAt: now });
    return requiredView(await this.dependencies.repository.getRfqView(rfqId));
  }

  async getRfqView(rfqId: string): Promise<RfqView> {
    const view = await this.dependencies.repository.getRfqView(rfqId);
    if (!view) throw new AgentNotFoundError("RFQ not found.");
    return view;
  }

  async tick(): Promise<number> {
    const active = await this.dependencies.repository.listActiveRfqs();
    for (const rfq of active) {
      if (rfq.status === "collecting" && this.now().getTime() >= new Date(rfq.quoteTimeoutAt).getTime()) {
        await this.maybeStartNegotiation(rfq, "timeout");
      }
      const round = await this.dependencies.repository.getNegotiationRound(rfq.id);
      if (round?.status === "open" && this.now().getTime() >= new Date(round.closesAt).getTime()) {
        await this.closeRound(rfq, round);
      }
    }
    return active.length;
  }

  private async inviteSuppliers(rfq: Rfq, candidates: Supplier[]): Promise<void> {
    const selected = candidates.filter((supplier) => supplier.phone).slice(0, this.config.maxSuppliersPerRfq);
    await Promise.all(selected.map(async (candidate) => {
      const now = this.now().toISOString();
      const supplier: RfqSupplier = {
        id: randomUUID(),
        rfqId: rfq.id,
        externalSupplierId: candidate.id,
        name: candidate.name,
        phone: candidate.phone!,
        rating: candidate.rating,
        status: "awaiting_first_reply",
        conversationId: null,
        providerInitialMessageId: null,
        lastSupplierMessageAt: null,
        serviceWindowExpiresAt: null,
        clarificationCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await this.dependencies.repository.addSupplier(supplier);
      const sent = await this.dependencies.whatsappGateway.sendInitialTemplate({
        idempotencyKey: `initial:${rfq.id}:${supplier.id}`,
        rfq,
        supplier,
      });
      await this.recordOutbound(rfq.id, supplier.id, sent.providerMessageId, `initial:${rfq.id}:${supplier.id}`, null);
      await this.dependencies.repository.updateSupplier(supplier.id, { providerInitialMessageId: sent.providerMessageId, updatedAt: this.now().toISOString() });
    }));
  }

  private async maybeStartNegotiation(rfq: Rfq, trigger: "threshold" | "timeout"): Promise<void> {
    if (rfq.status !== "collecting") return;
    const quotes = latestComparableBySupplier((await this.dependencies.repository.listQuotes(rfq.id)).filter((quote) => quote.round === "initial"));
    const minimum = trigger === "threshold" ? rfq.minQuotesToNegotiate : rfq.minQuotesOnTimeout;
    if (quotes.length < minimum) {
      if (trigger === "timeout") {
        await this.dependencies.repository.updateRfq(rfq.id, { status: "insufficient_quotes", updatedAt: this.now().toISOString() });
      }
      return;
    }

    const suppliers = await this.dependencies.repository.listSuppliers(rfq.id);
    const ranked = rankQuotes(quotes, suppliers);
    const anchor = ranked[0];
    const now = this.now();
    const round: NegotiationRound = {
      id: randomUUID(),
      rfqId: rfq.id,
      anchorQuoteId: anchor.id,
      anchorUnitPrice: anchor.deliveredUnitPrice!,
      normalizedUnit: anchor.normalizedUnit,
      targetSupplierIds: ranked.slice(1).map((quote) => quote.rfqSupplierId),
      respondedSupplierIds: [],
      trigger,
      status: "open",
      closesAt: addSeconds(now, rfq.counterofferTimeoutSeconds).toISOString(),
      createdAt: now.toISOString(),
      closedAt: null,
    };
    const created = await this.dependencies.repository.tryCreateNegotiationRound(round);
    if (!created) return;
    await this.dependencies.repository.updateRfq(rfq.id, { status: "negotiating", updatedAt: now.toISOString() });

    await Promise.all(created.targetSupplierIds.map(async (supplierId) => {
      const supplier = await this.dependencies.repository.getSupplier(supplierId);
      if (!supplier) return;
      const text = `Consegui ${formatMoney(created.anchorUnitPrice)}/${created.normalizedUnit} entregue para ${rfq.deliveryDeadline}. Você consegue cobrir? Se sim, qual é o seu melhor valor final com frete?`;
      const outcome = await this.sendWithinWindowOrReengage(rfq, supplier, `counteroffer:${created.id}:${supplier.id}`, text, "counteroffer");
      if (outcome === "sent") {
        await this.dependencies.repository.updateSupplier(supplier.id, { status: "counteroffered", updatedAt: this.now().toISOString() });
      }
    }));
  }

  private async requestClarification(rfq: Rfq, supplier: RfqSupplier, reason: string): Promise<void> {
    if (supplier.clarificationCount >= 1) return;
    const text = `Para comparar sua oferta, preciso do preço final com frete e da quantidade/unidade da embalagem. Pode confirmar? Motivo: ${reason}`;
    const outcome = await this.sendWithinWindowOrReengage(rfq, supplier, `clarification:${rfq.id}:${supplier.id}`, text, "clarification");
    await this.dependencies.repository.updateSupplier(supplier.id, {
      status: outcome === "sent" ? "clarification_needed" : "awaiting_reengagement",
      clarificationCount: supplier.clarificationCount + 1,
      updatedAt: this.now().toISOString(),
    });
  }

  private async markCounterResponse(rfq: Rfq, round: NegotiationRound, supplierId: string): Promise<void> {
    const responded = [...new Set([...round.respondedSupplierIds, supplierId])];
    const updated = await this.dependencies.repository.updateNegotiationRound(round.id, { respondedSupplierIds: responded });
    await this.dependencies.repository.updateSupplier(supplierId, { status: "counter_replied", updatedAt: this.now().toISOString() });
    if (updated.targetSupplierIds.every((id) => responded.includes(id))) await this.closeRound(rfq, updated);
  }

  private async closeRound(rfq: Rfq, round: NegotiationRound): Promise<void> {
    if (round.status === "closed") return;
    const now = this.now().toISOString();
    await this.dependencies.repository.updateNegotiationRound(round.id, { status: "closed", closedAt: now });
    await this.updateRecommendation(rfq.id);
    await this.dependencies.repository.updateRfq(rfq.id, { status: "awaiting_approval", updatedAt: now });
  }

  private async updateRecommendation(rfqId: string): Promise<void> {
    const [rfq, quotes, suppliers] = await Promise.all([
      this.dependencies.repository.getRfq(rfqId),
      this.dependencies.repository.listQuotes(rfqId),
      this.dependencies.repository.listSuppliers(rfqId),
    ]);
    if (!rfq) return;
    const latest = latestComparableBySupplier(quotes);
    if (!latest.length) return;
    const recommended = rankQuotes(latest, suppliers)[0];
    await this.dependencies.repository.updateRfq(rfqId, { recommendedQuoteId: recommended.id, updatedAt: this.now().toISOString() });
  }

  private async sendWithinWindowOrReengage(
    rfq: Rfq,
    supplier: RfqSupplier,
    idempotencyKey: string,
    text: string,
    reason: "counteroffer" | "clarification" | "award",
  ): Promise<"sent" | "reengagement"> {
    if (!isWindowOpen(supplier, this.now())) {
      await this.requestReengagement(supplier, idempotencyKey, reason);
      return "reengagement";
    }
    try {
      const result = await this.dependencies.whatsappGateway.sendSessionMessage({ idempotencyKey, rfqSupplierId: supplier.id, to: supplier.phone, text });
      await this.recordOutbound(rfq.id, supplier.id, result.providerMessageId, idempotencyKey, text);
      return "sent";
    } catch (error) {
      if (!looksLikeClosedWindow(error)) throw error;
      await this.requestReengagement(supplier, idempotencyKey, reason);
      return "reengagement";
    }
  }

  private async requestReengagement(
    supplier: RfqSupplier,
    idempotencyKey: string,
    reason: "counteroffer" | "clarification" | "award",
  ): Promise<void> {
    const result = await this.dependencies.whatsappGateway.requestReengagement({
      idempotencyKey: `reengage:${idempotencyKey}`,
      rfqSupplierId: supplier.id,
      to: supplier.phone,
      reason,
    });
    await this.dependencies.repository.updateSupplier(supplier.id, { status: "awaiting_reengagement", updatedAt: this.now().toISOString() });
    await this.recordOutbound(supplier.rfqId, supplier.id, result.providerMessageId, `reengage:${idempotencyKey}`, null);
  }

  private recordOutbound(
    rfqId: string,
    supplierId: string,
    providerMessageId: string,
    idempotencyKey: string,
    body: string | null,
  ): Promise<boolean> {
    return this.dependencies.repository.recordMessageIfNew({
      id: randomUUID(),
      providerMessageId,
      idempotencyKey,
      rfqId,
      rfqSupplierId: supplierId,
      direction: "outbound",
      type: "text",
      body,
      mediaId: null,
      mimeType: null,
      createdAt: this.now().toISOString(),
    });
  }

  private async resolveMedia(event: WhatsappInboundEvent) {
    if (!event.media) return undefined;
    if (event.media.url) return event.media;
    if (!event.media.mediaId) throw new AgentValidationError("mediaId or media URL is required.");
    return this.dependencies.whatsappGateway.getMedia(event.media.mediaId);
  }
}

function buildAwardMessage(rfq: Rfq, quote: Quote): string {
  return `Fechado! Confirmamos o pedido de ${rfq.quantity} ${rfq.unit} de ${rfq.item} por ${formatMoney(quote.deliveredUnitPrice!)}/${quote.normalizedUnit}, com entrega em ${rfq.deliveryDeadline}.`;
}

function latestComparableBySupplier(quotes: Quote[]): Quote[] {
  const latest = new Map<string, Quote>();
  for (const quote of quotes.filter((item) => item.comparable)) {
    const current = latest.get(quote.rfqSupplierId);
    if (!current || new Date(quote.createdAt).getTime() >= new Date(current.createdAt).getTime()) latest.set(quote.rfqSupplierId, quote);
  }
  return [...latest.values()];
}

function rankQuotes(quotes: Quote[], suppliers: RfqSupplier[]): Quote[] {
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  return [...quotes].sort((left, right) => {
    const price = left.deliveredUnitPrice! - right.deliveredUnitPrice!;
    if (price !== 0) return price;
    const deadline = (left.deliveryDeadline ?? "9999").localeCompare(right.deliveryDeadline ?? "9999");
    if (deadline !== 0) return deadline;
    const rating = (supplierMap.get(right.rfqSupplierId)?.rating ?? 0) - (supplierMap.get(left.rfqSupplierId)?.rating ?? 0);
    if (rating !== 0) return rating;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function isWindowOpen(supplier: RfqSupplier, now: Date): boolean {
  return supplier.serviceWindowExpiresAt !== null && new Date(supplier.serviceWindowExpiresAt).getTime() > now.getTime();
}

function looksLikeClosedWindow(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("131047") || /24.?hour|window.*closed/i.test(message);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1_000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1_000);
}

function requiredView(view: RfqView | null): RfqView {
  if (!view) throw new AgentNotFoundError("RFQ not found.");
  return view;
}

function validateInbound(event: WhatsappInboundEvent): void {
  if (!event.eventId || !event.providerMessageId || !event.rfqId || !event.rfqSupplierId || !event.supplierPhone) {
    throw new AgentValidationError("Incomplete WhatsApp event.");
  }
  if (!Number.isFinite(new Date(event.receivedAt).getTime())) throw new AgentValidationError("receivedAt must be an ISO date.");
  if (event.type === "text" && !event.text?.trim()) throw new AgentValidationError("Text event requires text.");
  if (event.type !== "text" && !event.media) throw new AgentValidationError("Media event requires media metadata.");
}
