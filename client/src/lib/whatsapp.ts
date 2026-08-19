export function normalizeBrazilianWhatsapp(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("+") && !trimmed.startsWith("+55")) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  return /^\d{10,11}$/.test(digits) ? `+55${digits}` : null;
}
