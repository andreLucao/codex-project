"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { normalizeBrazilianWhatsapp } from "@/lib/whatsapp";
import { hasSupabaseConfig } from "@/lib/onboarding-mode";

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

  const supabaseConfig = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!hasSupabaseConfig(supabaseConfig)) {
    console.info("Onboarding completed in local demo mode. No data was persisted.");
    redirect("/onboarding/concluido");
  }

  const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.from("restaurants").insert({
    name,
    responsible_name: responsibleName,
    address,
    whatsapp,
    frequent_supplies: frequentSupplies,
  });

  if (error) {
    console.error("Failed to create restaurant:", error.message);
    return { status: "error", message: "Não foi possível concluir o cadastro. Tente novamente." };
  }
  redirect("/onboarding/concluido");
}
