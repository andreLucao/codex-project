import { describe, expect, it } from "vitest";
import type { Supplier } from "../supplier-search.js";
import { RecordingWhatsappGateway, type SupplierGateway } from "./gateways.js";
import type { QuoteInterpreter, RfqIntake } from "./openai-agents.js";
import { InMemoryAgentRepository } from "./repository.js";
import { ProcurementAgentService } from "./service.js";
import type { QuoteExtraction, RfqDraft, WhatsappInboundEvent } from "./types.js";

class FixedIntake implements RfqIntake {
  async extract(): Promise<RfqDraft> {
    return {
      item: "tomate",
      supplierType: "distribuidor de hortifruti",
      quantity: 100,
      unit: "kg",
      deliveryDeadline: "2026-08-20",
      notes: null,
      missingFields: [],
    };
  }
}

class PriceInterpreter implements QuoteInterpreter {
  async interpret(input: Parameters<QuoteInterpreter["interpret"]>[0]) {
    const raw = input.text?.trim().toLocaleLowerCase("pt-BR") ?? "";
    let extraction: QuoteExtraction;
    if (raw === "cubro") {
      extraction = quoteExtraction(null, "counter_accept");
    } else if (raw === "não cubro") {
      extraction = quoteExtraction(null, "counter_decline");
    } else if (raw === "pare") {
      extraction = quoteExtraction(null, "opt_out");
    } else {
      extraction = quoteExtraction(Number(raw));
    }
    return { extraction, conversationId: input.conversationId ?? `conversation-${input.supplier.id}` };
  }
}

class FixedSupplierGateway implements SupplierGateway {
  constructor(private readonly count: number) {}
  async search(): Promise<Supplier[]> {
    return Array.from({ length: this.count }, (_, index) => ({
      id: `supplier-${index + 1}`,
      name: `Fornecedor ${index + 1}`,
      address: null,
      phone: `+55119999999${index}`,
      website: null,
      rating: 5 - index / 10,
      reviewCount: null,
      mapsUrl: null,
      latitude: null,
      longitude: null,
    }));
  }
}

function quoteExtraction(price: number | null, intent: QuoteExtraction["intent"] = "quote"): QuoteExtraction {
  return {
    intent,
    itemMatches: true,
    priceAmount: price,
    currency: price === null ? null : "BRL",
    priceQuantity: price === null ? null : 1,
    priceUnit: price === null ? null : "kg",
    packageQuantity: null,
    packageUnit: null,
    freightAmount: null,
    freightIncluded: price === null ? null : true,
    deliveryDeadline: "2026-08-20",
    confidence: 0.99,
    missingFields: [],
    evidence: price === null ? intent : `R$ ${price}/kg entregue`,
  };
}

function createHarness(supplierCount = 5) {
  let current = new Date("2026-08-19T12:00:00.000Z");
  const repository = new InMemoryAgentRepository();
  repository.seedProfile({ id: "restaurant-1", name: "Bistrô", location: "Campinas, SP" });
  const whatsapp = new RecordingWhatsappGateway();
  const service = new ProcurementAgentService({
    repository,
    intake: new FixedIntake(),
    interpreter: new PriceInterpreter(),
    supplierGateway: new FixedSupplierGateway(supplierCount),
    whatsappGateway: whatsapp,
    now: () => new Date(current),
  });
  return {
    service,
    repository,
    whatsapp,
    setNow: (value: string) => { current = new Date(value); },
  };
}

async function createRfq(harness: ReturnType<typeof createHarness>) {
  return harness.service.createRfq({ requestId: "request-1", restaurantId: "restaurant-1", message: "100 kg de tomate para amanhã" });
}

function inbound(rfqId: string, supplierId: string, phone: string, price: string, sequence: number): WhatsappInboundEvent {
  return {
    eventId: `event-${sequence}`,
    providerMessageId: `message-${sequence}`,
    restaurantId: "restaurant-1",
    rfqId,
    rfqSupplierId: supplierId,
    supplierPhone: phone,
    type: "text",
    text: price,
    receivedAt: "2026-08-19T12:00:10.000Z",
  };
}

describe("ProcurementAgentService", () => {
  it("hands the first contact to the template gateway and does not open the service window", async () => {
    const harness = createHarness();
    const view = await createRfq(harness);

    expect(harness.whatsapp.initialTemplates).toHaveLength(5);
    expect(view.suppliers.every((supplier) => supplier.status === "awaiting_first_reply")).toBe(true);
    expect(view.suppliers.every((supplier) => supplier.serviceWindowExpiresAt === null)).toBe(true);
  });

  it("starts exactly one counteroffer round after five comparable supplier replies", async () => {
    const harness = createHarness();
    let view = await createRfq(harness);
    const prices = [42, 40, 39, 41, 38];

    for (let index = 0; index < view.suppliers.length; index += 1) {
      const supplier = view.suppliers[index];
      view = await harness.service.handleInbound(inbound(view.rfq.id, supplier.id, supplier.phone, String(prices[index]), index));
    }

    expect(view.negotiationRound?.anchorUnitPrice).toBe(38);
    expect(view.negotiationRound?.targetSupplierIds).toHaveLength(4);
    expect(harness.whatsapp.sessionMessages).toHaveLength(4);
    expect(harness.whatsapp.sessionMessages.every((message) => message.text.includes("R$ 38,00/kg"))).toBe(true);
    expect(view.rfq.status).toBe("negotiating");

    const duplicate = inbound(view.rfq.id, view.suppliers[0].id, view.suppliers[0].phone, "10", 0);
    const duplicateView = await harness.service.handleInbound(duplicate);
    expect(duplicateView.quotes).toHaveLength(5);
    expect(harness.whatsapp.sessionMessages).toHaveLength(4);
  });

  it("records the frozen anchor when a counteroffered supplier says it covers", async () => {
    const harness = createHarness();
    let view = await createRfq(harness);
    const prices = [42, 40, 39, 41, 38];
    for (let index = 0; index < view.suppliers.length; index += 1) {
      const supplier = view.suppliers[index];
      view = await harness.service.handleInbound(inbound(view.rfq.id, supplier.id, supplier.phone, String(prices[index]), index));
    }
    const targetId = view.negotiationRound!.targetSupplierIds[0];
    const target = view.suppliers.find((supplier) => supplier.id === targetId)!;
    view = await harness.service.handleInbound(inbound(view.rfq.id, target.id, target.phone, "cubro", 99));

    const revised = view.quotes.find((quote) => quote.round === "counteroffer" && quote.rfqSupplierId === target.id);
    expect(revised?.deliveredUnitPrice).toBe(38);
    expect(view.negotiationRound?.respondedSupplierIds).toContain(target.id);
  });

  it("negotiates on timeout with two quotes and hands expired windows back to templates", async () => {
    const harness = createHarness(4);
    let view = await createRfq(harness);
    for (let index = 0; index < 2; index += 1) {
      const supplier = view.suppliers[index];
      view = await harness.service.handleInbound(inbound(view.rfq.id, supplier.id, supplier.phone, String(40 + index), index));
    }
    harness.setNow("2026-08-20T13:00:00.000Z");
    await harness.service.tick();
    view = await harness.service.getRfqView(view.rfq.id);

    expect(view.negotiationRound?.trigger).toBe("timeout");
    expect(harness.whatsapp.reengagements).toHaveLength(1);
    expect(harness.whatsapp.sessionMessages).toHaveLength(0);
    const targetId = view.negotiationRound!.targetSupplierIds[0];
    expect(view.suppliers.find((supplier) => supplier.id === targetId)?.status).toBe("awaiting_reengagement");
  });

  it("closes the round after all targets reply and sends the award only once", async () => {
    const harness = createHarness();
    let view = await createRfq(harness);
    const prices = [42, 40, 39, 41, 38];
    for (let index = 0; index < view.suppliers.length; index += 1) {
      const supplier = view.suppliers[index];
      view = await harness.service.handleInbound(inbound(view.rfq.id, supplier.id, supplier.phone, String(prices[index]), index));
    }
    for (let index = 0; index < view.negotiationRound!.targetSupplierIds.length; index += 1) {
      const supplierId = view.negotiationRound!.targetSupplierIds[index];
      const supplier = view.suppliers.find((item) => item.id === supplierId)!;
      view = await harness.service.handleInbound(inbound(view.rfq.id, supplier.id, supplier.phone, index === 0 ? "37" : "não cubro", 100 + index));
    }

    expect(view.rfq.status).toBe("awaiting_approval");
    expect(view.negotiationRound?.status).toBe("closed");
    const recommended = view.quotes.find((quote) => quote.id === view.rfq.recommendedQuoteId)!;
    expect(recommended.deliveredUnitPrice).toBe(37);

    view = await harness.service.approve(view.rfq.id, recommended.id, "approve-1");
    const sentAfterFirstApproval = harness.whatsapp.sessionMessages.length;
    expect(view.rfq.status).toBe("awarded");
    expect(view.rfq.approvedQuoteId).toBe(recommended.id);

    await harness.service.approve(view.rfq.id, recommended.id, "approve-1");
    expect(harness.whatsapp.sessionMessages).toHaveLength(sentAfterFirstApproval);
  });

  it("stops automation for opt-out messages", async () => {
    const harness = createHarness(1);
    let view = await createRfq(harness);
    const supplier = view.suppliers[0];
    view = await harness.service.handleInbound(inbound(view.rfq.id, supplier.id, supplier.phone, "pare", 1));
    expect(view.suppliers[0].status).toBe("opted_out");
    expect(view.quotes).toHaveLength(0);
  });
});
