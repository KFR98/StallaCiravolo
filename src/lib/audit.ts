import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { getSettings } from "./settings";

/**
 * IP di chi sta facendo l'operazione, letto dalla richiesta in corso (stessa logica del login:
 * X-Real-IP impostato da nginx). Fuori da una richiesta (script, backup automatico) non c'è: null.
 */
async function requestIp(): Promise<string | null> {
  try {
    if (!(await getSettings()).auditIpAll) return null;
    const { headers } = await import("next/headers");
    const h = await headers();
    const real = h.get("x-real-ip")?.trim();
    const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
    return (real || xff?.[xff.length - 1] || "").slice(0, 64) || null;
  } catch {
    return null;
  }
}

type Actor = { id: number; username: string } | null;

export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | number | null,
  summary: string,
  details?: unknown,
  tx?: Prisma.TransactionClient,
  ip?: string | null,
) {
  const client = tx ?? prisma;
  // Se non viene passato, l'IP si prende dalla richiesta (se attivo in Impostazioni → Sicurezza)
  if (ip === undefined) ip = await requestIp();
  await client.auditLog.create({
    data: {
      userId: actor?.id ?? null,
      username: actor?.username ?? "sistema",
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      summary: summary.slice(0, 500),
      details: details === undefined ? null : JSON.stringify(details, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
      ip: ip ?? null,
    },
  });
}

/** Differenza tra due oggetti (solo campi cambiati) per il registro attività. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { da: unknown; a: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = after[k];
    const b = before[k];
    const norm = (v: unknown) => (v != null && typeof v === "object" && "toString" in v && !(v instanceof Date) ? String(v) : v instanceof Date ? v.toISOString() : v);
    if (norm(a) !== norm(b)) out[k] = { da: norm(b), a: norm(a) };
  }
  return out;
}
