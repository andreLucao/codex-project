import "dotenv/config";
import { createApp, type AppServices } from "./app.js";
import { createDefaultAgentService, hasAgentRuntimeConfig } from "./agent/runtime.js";

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
