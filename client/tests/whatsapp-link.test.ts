import assert from "node:assert/strict";
import test from "node:test";
import { createWhatsappLink, FIRST_QUOTE_MESSAGE, MESA_CERTA_WHATSAPP } from "../src/lib/whatsapp-link.ts";

test("cria link do WhatsApp com número e mensagem codificados", () => {
  const link = createWhatsappLink();
  const url = new URL(link);

  assert.equal(`${url.origin}${url.pathname}`, `https://wa.me/${MESA_CERTA_WHATSAPP}`);
  assert.equal(url.searchParams.get("text"), FIRST_QUOTE_MESSAGE);
});
