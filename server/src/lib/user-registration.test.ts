import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBrazilianWhatsapp,
  parseUserRegistration,
  UserValidationError,
} from "./user-registration.js";

test("normaliza o WhatsApp do cadastro para apenas digitos", () => {
  assert.equal(normalizeBrazilianWhatsapp("(11) 99999-9999"), "5511999999999");
  assert.equal(normalizeBrazilianWhatsapp("+55 11 3333-4444"), "551133334444");
});

test("valida, limpa e remove insumos duplicados", () => {
  assert.deepEqual(
    parseUserRegistration({
      restaurantName: " Cantina do Bairro ",
      responsibleName: " Ana ",
      address: " Rua das Flores, 10 ",
      whatsapp: "+5511999999999",
      frequentSupplies: [" Mussarela ", "mussarela", "Tomate", ""],
    }),
    {
      restaurantName: "Cantina do Bairro",
      responsibleName: "Ana",
      address: "Rua das Flores, 10",
      whatsapp: "5511999999999",
      frequentSupplies: ["Mussarela", "Tomate"],
    },
  );
});

test("rejeita payload incompleto e telefone estrangeiro", () => {
  assert.throws(
    () => parseUserRegistration({}),
    (error: unknown) => error instanceof UserValidationError,
  );
  assert.throws(
    () => normalizeBrazilianWhatsapp("+1 212 555 0100"),
    (error: unknown) => error instanceof UserValidationError,
  );
});
