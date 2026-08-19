import { describe, expect, it } from "vitest";
import { convertQuantity, normalizeQuote } from "./normalization.js";
import type { QuoteExtraction, Rfq } from "./types.js";

const rfq: Rfq = {
  id: "rfq-1",
  requestId: "request-1",
  restaurantId: "restaurant-1",
  rawRequest: "100 kg de tomate para quinta",
  item: "tomate",
  supplierType: "distribuidor de hortifruti",
  quantity: 100,
  unit: "kg",
  deliveryDeadline: "2026-08-20",
  deliveryLocation: "Campinas, SP",
  notes: null,
  status: "collecting",
  minQuotesToNegotiate: 5,
  minQuotesOnTimeout: 2,
  quoteTimeoutAt: "2026-08-19T12:01:00.000Z",
  counterofferTimeoutSeconds: 60,
  recommendedQuoteId: null,
  approvedQuoteId: null,
  createdAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:00:00.000Z",
};

const baseExtraction: QuoteExtraction = {
  intent: "quote",
  itemMatches: true,
  priceAmount: 120,
  currency: "BRL",
  priceQuantity: 1,
  priceUnit: "caixa",
  packageQuantity: 20,
  packageUnit: "kg",
  freightAmount: 20,
  freightIncluded: false,
  deliveryDeadline: "2026-08-20",
  confidence: 0.95,
  missingFields: [],
  evidence: "R$ 120 a caixa de 20 kg e R$ 20 de frete",
};

describe("unit and delivered price normalization", () => {
  it("converts compatible units", () => {
    expect(convertQuantity(1_000, "g", "kg")).toBe(1);
    expect(convertQuantity(2_000, "ml", "l")).toBe(2);
    expect(convertQuantity(1, "kg", "l")).toBeNull();
  });

  it("normalizes package price and allocates freight over the requested quantity", () => {
    expect(normalizeQuote(rfq, baseExtraction)).toEqual({
      comparable: true,
      deliveredUnitPrice: 6.2,
      deliveredTotal: 620,
      normalizedUnit: "kg",
      reason: null,
    });
  });

  it("rejects a package without declared content", () => {
    const result = normalizeQuote(rfq, { ...baseExtraction, packageQuantity: null, packageUnit: null });
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/embalagem/);
  });

  it("uses the frozen anchor when a supplier says it covers the offer", () => {
    const result = normalizeQuote(rfq, {
      ...baseExtraction,
      intent: "counter_accept",
      currency: null,
      priceAmount: null,
      priceQuantity: null,
      priceUnit: null,
    }, 5.75);
    expect(result.deliveredUnitPrice).toBe(5.75);
    expect(result.deliveredTotal).toBe(575);
  });
});
