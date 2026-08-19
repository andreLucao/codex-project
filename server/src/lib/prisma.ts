import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function hasPrismaConfig(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("A variavel de ambiente DATABASE_URL nao foi configurada.");
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export async function connectPrismaIfConfigured(): Promise<boolean> {
  if (!hasPrismaConfig()) return false;
  await getPrisma().$connect();
  return true;
}

export async function disconnectPrisma(): Promise<void> {
  if (!globalForPrisma.prisma && !hasPrismaConfig()) return;
  await getPrisma().$disconnect();
}
