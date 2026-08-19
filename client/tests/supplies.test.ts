import assert from "node:assert/strict";
import test from "node:test";
import supplies from "../src/data/supplies.json" with { type: "json" };
import { normalizeSupplyName } from "../src/lib/supplies.ts";

test("catálogo contém 100 insumos únicos", () => {
  assert.equal(supplies.length, 100);
  assert.equal(new Set(supplies.map((item) => normalizeSupplyName(item.name))).size, 100);
});

test("normalização ignora caixa e acentos", () => {
  assert.equal(normalizeSupplyName("  PIMENTÃO "), "pimentao");
  assert.equal(normalizeSupplyName("Mussarela"), "mussarela");
});
