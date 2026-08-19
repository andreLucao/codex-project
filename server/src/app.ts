import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  ApifySupplierSearchClient,
  SupplierSearchError,
  SupplierSearchService,
  type SupplierSearchInput,
} from "./supplier-search.js";

export function createApp(service?: SupplierSearchService) {
  const app = express();
  let defaultService: SupplierSearchService | undefined;
  const getSupplierSearchService = () => {
    if (service) return service;
    defaultService ??= new SupplierSearchService(new ApifySupplierSearchClient());
    return defaultService;
  };

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" }));
  app.use(express.json());

  app.get("/api/hello", (_req, res) => {
    res.json({ message: "Hello from the Express server!", timestamp: new Date().toISOString() });
  });

  app.post("/api/supplier-searches", async (req, res) => {
    const input = parseSearchInput(req);
    if (!input) {
      return res.status(400).json({ error: "supplierType and location must be non-empty strings." });
    }
    try {
      return res.status(202).json(await getSupplierSearchService().start(input));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/supplier-searches/:runId", async (req, res) => {
    if (!req.params.runId.trim()) {
      return res.status(400).json({ error: "runId is required." });
    }
    try {
      return res.json(await getSupplierSearchService().get(req.params.runId));
    } catch (error) {
      return sendError(res, error);
    }
  });

  return app;
}

function parseSearchInput(req: Request): SupplierSearchInput | null {
  const { supplierType, location } = req.body ?? {};
  if (typeof supplierType !== "string" || typeof location !== "string") return null;
  const normalized = { supplierType: supplierType.trim(), location: location.trim() };
  return normalized.supplierType && normalized.location ? normalized : null;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof SupplierSearchError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFIGURATION_ERROR" ? 503 : 502;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: "Unexpected server error." });
}
