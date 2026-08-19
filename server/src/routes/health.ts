import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { getPrisma, hasPrismaConfig } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    const url = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey) throw new Error("Supabase nao foi configurado.");

    const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { error } = await supabase.from("rfqs").select("id").limit(1);
    if (error) throw error;

    let prismaStatus = "not_configured";
    if (hasPrismaConfig()) {
      await getPrisma().$queryRaw`SELECT 1`;
      prismaStatus = "connected";
    }

    res.json({ status: "ok", supabase: "connected", prisma: prismaStatus });
  } catch (error) {
    console.error("Database health check failed:", error);
    res.status(503).json({ status: "error", supabase: "disconnected" });
  }
});
