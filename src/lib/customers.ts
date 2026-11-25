import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Nome normalizzato per riconoscere lo stesso cliente scritto in modi diversi ("mario  ROSSI " = "Mario Rossi"). */
export function customerKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 120);
}
export const cleanName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);

/**
 * Collega un acquirente alla rubrica: se il nome c'è già usa quel cliente, altrimenti (se attivo in Impostazioni) lo crea.
 * Restituisce l'id del cliente o null.
 */
export async function linkCustomer(
  tx: Prisma.TransactionClient,
  name: string | null | undefined,
  opts: { autoCreate: boolean; userId: number; missiva?: string | null },
): Promise<number | null> {
  const clean = name ? cleanName(name) : "";
  if (clean.length < 2) return null;
  const key = customerKey(clean);
  const found = await tx.customer.findUnique({ where: { nameKey: key }, select: { id: true } });
  if (found) return found.id;
  if (!opts.autoCreate) return null;
  const c = await tx.customer.create({ data: { name: clean, nameKey: key, missiva: opts.missiva?.trim().toUpperCase().slice(0, 40) || null, createdById: opts.userId } });
  return c.id;
}

/** Nomi dei clienti per i suggerimenti mentre si scrive (i più recenti per primi). */
export async function customerSuggestions(limit = 500) {
  const rows = await prisma.customer.findMany({ orderBy: { updatedAt: "desc" }, take: limit, select: { id: true, name: true, missiva: true } });
  return rows;
}
