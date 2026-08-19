import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { SupplierSearchService, type SupplierSearchClient } from "./supplier-search.js";

function createService(): SupplierSearchService {
  const client: SupplierSearchClient = {
    startSearch: vi.fn().mockResolvedValue({ id: "run-42", status: "RUNNING" }),
    getRun: vi.fn().mockResolvedValue({ id: "run-42", status: "SUCCEEDED", defaultDatasetId: "dataset-42" }),
    getDatasetItems: vi.fn().mockResolvedValue([{ placeId: "place-42", title: "Fornecedor Teste" }]),
  };
  return new SupplierSearchService(client);
}

describe("supplier search routes", () => {
  it("starts a search and returns an accepted asynchronous run", async () => {
    const response = await request(createApp(createService()))
      .post("/api/supplier-searches")
      .send({ supplierType: "fornecedor de carnes", location: "São Paulo, SP" });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ runId: "run-42", status: "running" });
  });

  it("rejects incomplete supplier search input", async () => {
    const response = await request(createApp(createService()))
      .post("/api/supplier-searches")
      .send({ supplierType: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/supplierType and location/);
  });

  it("returns a completed normalized search result", async () => {
    const response = await request(createApp(createService())).get("/api/supplier-searches/run-42");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "succeeded",
      suppliers: [expect.objectContaining({ id: "place-42", name: "Fornecedor Teste" })],
    });
  });

  it("returns a configuration error only when a search is requested without APIFY_TOKEN", async () => {
    const previousToken = process.env.APIFY_TOKEN;
    delete process.env.APIFY_TOKEN;
    const response = await request(createApp())
      .post("/api/supplier-searches")
      .send({ supplierType: "fornecedor de gelo", location: "Rio de Janeiro, RJ" });
    if (previousToken === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = previousToken;

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("CONFIGURATION_ERROR");
  });
});
