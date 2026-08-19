import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { healthRouter } from "./routes/health.js";
import { whatsappRouter, type RequestWithRawBody } from "./routes/whatsapp.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" }));
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      // A Meta assina os bytes exatos enviados, antes do parse do JSON.
      (req as RequestWithRawBody).rawBody = Buffer.from(buffer);
    },
  }),
);

app.get("/api/hello", (_req, res) => {
  res.json({
    message: "Hello from the Express server!",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/health", healthRouter);
app.use("/api/whatsapp", whatsappRouter);

async function startServer(): Promise<void> {
  await prisma.$connect();

  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`${signal} received. Shutting down...`);

    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch((error: unknown) => {
  console.error("Failed to connect to the database:", error);
  process.exitCode = 1;
});
