export type UserRegistration = {
  restaurantName: string;
  responsibleName: string;
  address: string;
  whatsapp: string;
  frequentSupplies: string[];
};

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new UserValidationError(`O campo '${field}' e obrigatorio.`);
  }

  const text = value.trim();
  if (text.length > maxLength) {
    throw new UserValidationError(`O campo '${field}' deve ter no maximo ${maxLength} caracteres.`);
  }

  return text;
}

export function normalizeBrazilianWhatsapp(value: unknown): string {
  if (typeof value !== "string") {
    throw new UserValidationError("Informe um WhatsApp brasileiro com DDD.");
  }

  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("+") && !trimmedValue.startsWith("+55")) {
    throw new UserValidationError(
      "Informe um WhatsApp brasileiro com DDD, como +5511999999999.",
    );
  }

  let digits = trimmedValue.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;

  if (!/^55\d{10,11}$/.test(digits)) {
    throw new UserValidationError(
      "Informe um WhatsApp brasileiro com DDD, como +5511999999999.",
    );
  }

  return digits;
}

function parseFrequentSupplies(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new UserValidationError("O campo 'frequentSupplies' deve ser uma lista de textos.");
  }

  const uniqueSupplies = new Map<string, string>();
  for (const rawSupply of value) {
    const supply = rawSupply.trim();
    if (!supply) continue;
    if (supply.length > 120) {
      throw new UserValidationError("Cada insumo deve ter no maximo 120 caracteres.");
    }

    const key = supply.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!uniqueSupplies.has(key)) uniqueSupplies.set(key, supply);
  }

  if (uniqueSupplies.size > 50) {
    throw new UserValidationError("Informe no maximo 50 insumos frequentes.");
  }

  return [...uniqueSupplies.values()];
}

export function parseUserRegistration(value: unknown): UserRegistration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UserValidationError("O corpo da requisicao deve ser um objeto JSON.");
  }

  const body = value as Record<string, unknown>;
  return {
    restaurantName: requiredText(body.restaurantName, "restaurantName", 120),
    responsibleName: requiredText(body.responsibleName, "responsibleName", 120),
    address: requiredText(body.address, "address", 300),
    whatsapp: normalizeBrazilianWhatsapp(body.whatsapp),
    frequentSupplies: parseFrequentSupplies(body.frequentSupplies),
  };
}
