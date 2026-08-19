import assert from "node:assert/strict";
import test from "node:test";
import { hasSupabaseConfig } from "../src/lib/onboarding-mode.ts";

test("ativa o modo demo quando a configuração do Supabase está ausente", () => {
  assert.equal(hasSupabaseConfig({}), false);
  assert.equal(hasSupabaseConfig({ url: "https://example.supabase.co" }), false);
});

test("usa persistência real quando a configuração está completa", () => {
  assert.equal(hasSupabaseConfig({ url: "https://example.supabase.co", serviceRoleKey: "service-role-key" }), true);
});
