import { describe, expect, it, vi } from "vitest";
import {
  MAX_SUPPLIERS_PER_SEARCH,
  SupplierSearchService,
  normalizeSupplier,
  type SupplierSearchClient,
} from "./supplier-search.js";

function createClient(overrides: Partial<SupplierSearchClient> = {}): SupplierSearchClient {
  return {
    startSearch: vi.fn().mockResolvedValue({ id: "run-123", status: "RUNNING" }),
    getRun: vi.fn().mockResolvedValue({ id: "run-123", status: "RUNNING" }),
    getDatasetItems: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("SupplierSearchService", () => {
  it("converts supplier criteria to the Apify actor input", async () => {
    const client = createClient();
    const service = new SupplierSearchService(client);

    await expect(service.start({ supplierType: "distribuidor de hortifruti", location: "Campinas, SP" }))
      .resolves.toEqual({ runId: "run-123", status: "running" });

    expect(client.startSearch).toHaveBeenCalledWith({
      searchStringsArray: ["distribuidor de hortifruti"],
      locationQuery: "Campinas, SP",
      maxCrawledPlacesPerSearch: MAX_SUPPLIERS_PER_SEARCH,
    });
  });

  it("returns normalized suppliers when the Apify run succeeds", async () => {
    const client = createClient({
      getRun: vi.fn().mockResolvedValue({ id: "run-123", status: "SUCCEEDED", defaultDatasetId: "dataset-1" }),
      getDatasetItems: vi.fn().mockResolvedValue([
        { placeId: "place-1", title: "Hortifruti Bom Preço", totalScore: 4.8, reviewsCount: 32 },
      ]),
    });

    await expect(new SupplierSearchService(client).get("run-123")).resolves.toEqual({
      status: "succeeded",
      suppliers: [{
        id: "place-1",
        name: "Hortifruti Bom Preço",
        address: null,
        phone: null,
        website: null,
        rating: 4.8,
        reviewCount: 32,
        mapsUrl: null,
        latitude: null,
        longitude: null,
      }],
    });
  });

  it("reports failed and still-running runs without loading the dataset", async () => {
    const failed = new SupplierSearchService(createClient({
      getRun: vi.fn().mockResolvedValue({ id: "run-123", status: "FAILED" }),
    }));
    await expect(failed.get("run-123")).resolves.toEqual({ status: "failed" });

    const running = new SupplierSearchService(createClient());
    await expect(running.get("run-123")).resolves.toEqual({ status: "running" });
  });

  it("reports a missing run explicitly", async () => {
    const service = new SupplierSearchService(createClient({ getRun: vi.fn().mockResolvedValue(null) }));

    await expect(service.get("unknown-run")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("normalizeSupplier", () => {
  it("handles optional Apify place fields", () => {
    expect(normalizeSupplier({ title: "Fornecedor sem detalhes", location: null })).toEqual({
      id: "unknown",
      name: "Fornecedor sem detalhes",
      address: null,
      phone: null,
      website: null,
      rating: null,
      reviewCount: null,
      mapsUrl: null,
      latitude: null,
      longitude: null,
    });
  });
});
