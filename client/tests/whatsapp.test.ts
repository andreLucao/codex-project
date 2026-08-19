import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrazilianWhatsapp } from "../src/lib/whatsapp.ts";

test("normaliza números brasileiros para o formato canônico", () => {
  assert.equal(normalizeBrazilianWhatsapp("(11) 99999-9999"), "+5511999999999");
  assert.equal(normalizeBrazilianWhatsapp("5511999999999"), "+5511999999999");
  assert.equal(normalizeBrazilianWhatsapp("+55 11 99999-9999"), "+5511999999999");
  assert.equal(normalizeBrazilianWhatsapp("11 3333-4444"), "+551133334444");
});

test("rejeita país e quantidade de dígitos inválidos", () => {
  assert.equal(normalizeBrazilianWhatsapp("+1 212 555 0100"), null);
  assert.equal(normalizeBrazilianWhatsapp("99999-9999"), null);
  assert.equal(normalizeBrazilianWhatsapp("551199999999999"), null);
});
