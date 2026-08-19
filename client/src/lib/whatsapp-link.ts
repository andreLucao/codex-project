export const MESA_CERTA_WHATSAPP = "5511913912829";
export const FIRST_QUOTE_MESSAGE = "Olá! Acabei de cadastrar meu restaurante na Mesa Certa e quero fazer minha primeira cotação.";

export function createWhatsappLink(phone = MESA_CERTA_WHATSAPP, message = FIRST_QUOTE_MESSAGE) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
