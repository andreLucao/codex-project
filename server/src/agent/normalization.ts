import type { NormalizedQuote, QuoteExtraction, Rfq } from "./types.js";

type UnitDimension = "mass" | "volume" | "count";

type CanonicalUnit = {
  dimension: UnitDimension;
  canonical: "kg" | "l" | "un";
  factor: number;
};

const UNIT_ALIASES: Record<string, CanonicalUnit> = {
  g: { dimension: "mass", canonical: "kg", factor: 0.001 },
  grama: { dimension: "mass", canonical: "kg", factor: 0.001 },
  gramas: { dimension: "mass", canonical: "kg", factor: 0.001 },
  kg: { dimension: "mass", canonical: "kg", factor: 1 },
  quilo: { dimension: "mass", canonical: "kg", factor: 1 },
  quilos: { dimension: "mass", canonical: "kg", factor: 1 },
  ml: { dimension: "volume", canonical: "l", factor: 0.001 },
  l: { dimension: "volume", canonical: "l", factor: 1 },
  litro: { dimension: "volume", canonical: "l", factor: 1 },
  litros: { dimension: "volume", canonical: "l", factor: 1 },
  un: { dimension: "count", canonical: "un", factor: 1 },
  unidade: { dimension: "count", canonical: "un", factor: 1 },
  unidades: { dimension: "count", canonical: "un", factor: 1 },
};

const PACKAGE_UNITS = new Set(["caixa", "cx", "pacote", "pct", "fardo", "saco"]);

export function normalizeUnit(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/[.]/g, "");
}

function resolveUnit(unit: string): CanonicalUnit | null {
  return UNIT_ALIASES[normalizeUnit(unit)] ?? null;
}

export function convertQuantity(value: number, fromUnit: string, toUnit: string): number | null {
  const from = resolveUnit(fromUnit);
  const to = resolveUnit(toUnit);
  if (!from || !to || from.dimension !== to.dimension) return null;
  return (value * from.factor) / to.factor;
}

export function normalizeQuote(rfq: Rfq, extraction: QuoteExtraction, anchorUnitPrice?: number): NormalizedQuote {
  const baseUnit = resolveUnit(rfq.unit);
  if (!baseUnit) {
    return notComparable(rfq.unit, `Unidade-base não suportada: ${rfq.unit}.`);
  }

  if (!extraction.itemMatches) return notComparable(baseUnit.canonical, "A oferta não corresponde ao item da RFQ.");

  if (extraction.intent === "counter_accept" && anchorUnitPrice !== undefined) {
    return {
      comparable: true,
      deliveredUnitPrice: anchorUnitPrice,
      deliveredTotal: anchorUnitPrice * convertRfqQuantity(rfq, baseUnit),
      normalizedUnit: baseUnit.canonical,
      reason: null,
    };
  }

  if (extraction.currency !== "BRL") return notComparable(baseUnit.canonical, "A oferta precisa estar em BRL.");

  if (extraction.priceAmount === null || extraction.priceAmount <= 0) {
    return notComparable(baseUnit.canonical, "Preço positivo não informado.");
  }

  let basisQuantity = extraction.priceQuantity ?? 1;
  let basisUnit = extraction.priceUnit ?? rfq.unit;
  const normalizedBasisUnit = normalizeUnit(basisUnit);

  if (PACKAGE_UNITS.has(normalizedBasisUnit)) {
    if (!extraction.packageQuantity || !extraction.packageUnit) {
      return notComparable(baseUnit.canonical, "Conteúdo da embalagem não informado.");
    }
    basisQuantity *= extraction.packageQuantity;
    basisUnit = extraction.packageUnit;
  }

  const quantityInBaseUnit = convertQuantity(basisQuantity, basisUnit, baseUnit.canonical);
  if (quantityInBaseUnit === null || quantityInBaseUnit <= 0) {
    return notComparable(baseUnit.canonical, "Unidade da oferta incompatível com a RFQ.");
  }

  if (extraction.freightIncluded === null && extraction.freightAmount === null) {
    return notComparable(baseUnit.canonical, "Não foi possível determinar o frete.");
  }

  const freight = extraction.freightIncluded ? 0 : (extraction.freightAmount ?? 0);
  const rfqQuantity = convertRfqQuantity(rfq, baseUnit);
  const goodsUnitPrice = extraction.priceAmount / quantityInBaseUnit;
  const deliveredTotal = goodsUnitPrice * rfqQuantity + freight;

  return {
    comparable: true,
    deliveredUnitPrice: deliveredTotal / rfqQuantity,
    deliveredTotal,
    normalizedUnit: baseUnit.canonical,
    reason: null,
  };
}

function convertRfqQuantity(rfq: Rfq, baseUnit: CanonicalUnit): number {
  const converted = convertQuantity(rfq.quantity, rfq.unit, baseUnit.canonical);
  if (converted === null || converted <= 0) throw new Error("Invalid RFQ quantity/unit combination.");
  return converted;
}

function notComparable(normalizedUnit: string, reason: string): NormalizedQuote {
  return { comparable: false, deliveredUnitPrice: null, deliveredTotal: null, normalizedUnit, reason };
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
