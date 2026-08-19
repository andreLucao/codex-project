import { prisma } from "../lib/prisma.js";
import {
  normalizeBrazilianWhatsapp,
  type UserRegistration,
} from "../lib/user-registration.js";

export type UserProfile = {
  id: string;
  restaurantName: string;
  responsibleName: string;
  address: string;
  whatsapp: string;
  frequentSupplies: string[];
  createdAt: Date;
  updatedAt: Date;
};

const userProfileSelect = {
  id: true,
  restaurantName: true,
  responsibleName: true,
  address: true,
  frequentSupplies: true,
  createdAt: true,
  updatedAt: true,
  contact: { select: { phoneNumber: true } },
} as const;

function toUserProfile(user: {
  id: string;
  restaurantName: string;
  responsibleName: string;
  address: string;
  frequentSupplies: string[];
  createdAt: Date;
  updatedAt: Date;
  contact: { phoneNumber: string };
}): UserProfile {
  return {
    id: user.id,
    restaurantName: user.restaurantName,
    responsibleName: user.responsibleName,
    address: user.address,
    whatsapp: `+${user.contact.phoneNumber}`,
    frequentSupplies: user.frequentSupplies,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function saveUserRegistration(
  registration: UserRegistration,
): Promise<{ user: UserProfile; created: boolean }> {
  return prisma.$transaction(async (transaction) => {
    const contact = await transaction.contact.upsert({
      where: { phoneNumber: registration.whatsapp },
      update: {},
      create: { phoneNumber: registration.whatsapp },
      select: { id: true, user: { select: { id: true } } },
    });
    const created = contact.user === null;
    const user = await transaction.user.upsert({
      where: { contactId: contact.id },
      update: {
        restaurantName: registration.restaurantName,
        responsibleName: registration.responsibleName,
        address: registration.address,
        frequentSupplies: registration.frequentSupplies,
      },
      create: {
        contactId: contact.id,
        restaurantName: registration.restaurantName,
        responsibleName: registration.responsibleName,
        address: registration.address,
        frequentSupplies: registration.frequentSupplies,
      },
      select: userProfileSelect,
    });

    return { user: toUserProfile(user), created };
  });
}

/** Contexto cadastral seguro para ser anexado ao prompt do agente. */
export async function getUserContextByWhatsapp(
  whatsapp: string,
): Promise<UserProfile | null> {
  const phoneNumber = normalizeBrazilianWhatsapp(whatsapp);
  const user = await prisma.user.findFirst({
    where: { contact: { phoneNumber } },
    select: userProfileSelect,
  });

  return user ? toUserProfile(user) : null;
}
