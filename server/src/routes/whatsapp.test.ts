import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhatsappRouter, type RequestWithRawBody } from "./whatsapp.js";

const previousEnv = {
  secret: process.env.META_APP_SECRET,
  required: process.env.META_WEBHOOK_REQUIRED,
  verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
};

afterEach(() => {
  restoreEnv("META_APP_SECRET", previousEnv.secret);
  restoreEnv("META_WEBHOOK_REQUIRED", previousEnv.required);
  restoreEnv("META_WEBHOOK_VERIFY_TOKEN", previousEnv.verifyToken);
});

describe("WhatsApp webhook routes", () => {
  it("validates Meta callback verification", async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
    const response = await request(createTestApp())
      .get("/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "challenge-42" });

    expect(response.status).toBe(200);
    expect(response.text).toBe("challenge-42");
  });

  it("accepts a correctly signed webhook and forwards it after responding", async () => {
    process.env.META_APP_SECRET = "app-secret";
    process.env.META_WEBHOOK_REQUIRED = "true";
    const onWebhook = vi.fn().mockResolvedValue(undefined);
    const payload = { object: "whatsapp_business_account", entry: [] };
    const raw = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;

    const response = await request(createTestApp(onWebhook))
      .post("/webhook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signature)
      .send(raw);

    expect(response.status).toBe(200);
    expect(onWebhook).toHaveBeenCalledWith(payload);
  });

  it("rejects an invalid signature", async () => {
    process.env.META_APP_SECRET = "app-secret";
    process.env.META_WEBHOOK_REQUIRED = "true";
    const response = await request(createTestApp())
      .post("/webhook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));

    expect(response.status).toBe(401);
  });
});

function createTestApp(onWebhook?: (body: Record<string, unknown>) => Promise<void>) {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => {
      (req as RequestWithRawBody).rawBody = Buffer.from(buffer);
    },
  }));
  app.use(createWhatsappRouter({ onWebhook }));
  return app;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
