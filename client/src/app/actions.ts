"use server";

import { redirect } from "next/navigation";
import { normalizeBrazilianWhatsapp } from "@/lib/whatsapp";

export type FormState = { status: "idle" | "success" | "error"; message: string };

export async function createRestaurant(_previous: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const responsibleName = String(formData.get("responsibleName") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const whatsapp = normalizeBrazilianWhatsapp(String(formData.get("whatsapp") ?? ""));
  const frequentSupplies = String(formData.get("frequentSupplies") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!name || !responsibleName || !address) {
    return { status: "error", message: "Preencha o restaurante, o responsável e o endereço." };
  }
  if (!whatsapp) {
    return { status: "error", message: "Informe um WhatsApp brasileiro com DDD, como +5511999999999." };
  }

  const apiUrl = (
    process.env.SERVER_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000"
  ).replace(/\/$/, "");

  try {
    const response = await fetch(`${apiUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantName: name,
        responsibleName,
        address,
        whatsapp,
        frequentSupplies,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      console.error("Failed to create user:", response.status, body?.error);
      return {
        status: "error",
        message: body?.error ?? "Não foi possível concluir o cadastro. Tente novamente.",
      };
    }
  } catch (error) {
    console.error("Failed to reach the backend:", error);
    return { status: "error", message: "Não foi possível concluir o cadastro. Tente novamente." };
  }

  redirect("/onboarding/concluido");
}
