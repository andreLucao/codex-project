import express from "express";
import cors from "cors";
import { loadEnvFile } from "node:process";
import { whatsappRouter, type RequestWithRawBody } from "./routes/whatsapp.js";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

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

app.use("/api/whatsapp", whatsappRouter);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
