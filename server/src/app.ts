import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  ApifySupplierSearchClient,
  SupplierSearchError,
  SupplierSearchService,
  type SupplierSearchInput,
} from "./supplier-search.js";
import { createDefaultAgentService } from "./agent/runtime.js";
import { AgentNotFoundError, AgentValidationError, ProcurementAgentService } from "./agent/service.js";
import type { WhatsappInboundEvent } from "./agent/types.js";

export type AppServices = {
  supplierSearchService?: SupplierSearchService;
  agentService?: ProcurementAgentService;
};

export function createApp(serviceOrOptions?: SupplierSearchService | AppServices) {
  const app = express();
  const options: AppServices = serviceOrOptions instanceof SupplierSearchService
    ? { supplierSearchService: serviceOrOptions }
    : (serviceOrOptions ?? {});
  let defaultService: SupplierSearchService | undefined;
  let defaultAgentService: ProcurementAgentService | undefined;
  const getSupplierSearchService = () => {
    if (options.supplierSearchService) return options.supplierSearchService;
    defaultService ??= new SupplierSearchService(new ApifySupplierSearchClient());
    return defaultService;
  };
  const getAgentService = () => {
    if (options.agentService) return options.agentService;
    defaultAgentService ??= createDefaultAgentService();
    return defaultAgentService;
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

  app.post("/api/agent/rfqs", async (req, res) => {
    const { requestId, restaurantId, message } = req.body ?? {};
    if (![requestId, restaurantId, message].every((value) => typeof value === "string" && value.trim())) {
      return res.status(400).json({ error: "requestId, restaurantId and message are required." });
    }
    try {
      return res.status(202).json(await getAgentService().createRfq({ requestId, restaurantId, message }));
    } catch (error) {
      return sendAgentError(res, error);
    }
  });

  app.post("/api/agent/whatsapp-events", async (req, res) => {
    try {
      return res.json(await getAgentService().handleInbound(req.body as WhatsappInboundEvent));
    } catch (error) {
      return sendAgentError(res, error);
    }
  });

  app.get("/api/agent/rfqs/:rfqId", async (req, res) => {
    try {
      return res.json(await getAgentService().getRfqView(req.params.rfqId));
    } catch (error) {
      return sendAgentError(res, error);
    }
  });

  app.post("/api/agent/rfqs/:rfqId/approve", async (req, res) => {
    const { quoteId, requestId } = req.body ?? {};
    if (typeof quoteId !== "string" || typeof requestId !== "string") {
      return res.status(400).json({ error: "quoteId and requestId are required." });
    }
    try {
      return res.json(await getAgentService().approve(req.params.rfqId, quoteId, requestId));
    } catch (error) {
      return sendAgentError(res, error);
    }
  });

  app.post("/api/agent/tick", async (_req, res) => {
    try {
      return res.json({ activeRfqs: await getAgentService().tick() });
    } catch (error) {
      return sendAgentError(res, error);
    }
  });

  return app;
}

function sendAgentError(res: Response, error: unknown) {
  if (error instanceof AgentValidationError) {
    return res.status(422).json({ error: error.message, details: error.details });
  }
  if (error instanceof AgentNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof Error && /required|must be a positive integer/i.test(error.message)) {
    return res.status(503).json({ error: error.message, code: "AGENT_CONFIGURATION_ERROR" });
  }
  return res.status(500).json({ error: "Agent operation failed." });
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
