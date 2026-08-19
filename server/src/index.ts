import "dotenv/config";
import { createDefaultAgentService, hasAgentRuntimeConfig } from "./agent/runtime.js";
import { createApp, type AppServices } from "./app.js";
import { connectPrismaIfConfigured, disconnectPrisma } from "./lib/prisma.js";
import { healthRouter } from "./routes/health.js";

const PORT = Number(process.env.PORT ?? 4000);
const services: AppServices = {};

if (hasAgentRuntimeConfig()) {
  services.agentService = createDefaultAgentService();
  const interval = setInterval(() => {
    void services.agentService!.tick().catch((error) => console.error("Agent worker tick failed", error));
  }, Number(process.env.AGENT_WORKER_INTERVAL_MS ?? 2_000));
  interval.unref();
}

const app = createApp(services);
app.use("/api/health", healthRouter);

async function startServer(): Promise<void> {
  const prismaConnected = await connectPrismaIfConfigured();
  if (!prismaConnected) console.log("DATABASE_URL not configured; using Supabase as the agent database.");

  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`${signal} received. Shutting down...`);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch((error: unknown) => {
  console.error("Failed to start the server:", error);
  process.exitCode = 1;
});
