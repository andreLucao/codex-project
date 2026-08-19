import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma is optional in this app; the procurement agent persists in Supabase.
    // A placeholder lets `prisma generate` and TypeScript builds run without a local DB.
    url: process.env.DATABASE_URL?.trim() || "postgresql://unused:unused@localhost:5432/unused",
  },
});
