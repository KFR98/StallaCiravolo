import { getCurrentUser } from "@/lib/auth";
import { can, canSeeBreed, roleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

/**
 * Backup dei punti della mappa in un file JSON da tenere sul proprio PC.
 * Razza e manto sono salvati per NOME (non per numero interno), così il file si può
 * reimportare anche dopo un azzeramento o su un'altra installazione.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autenticato", { status: 401 });
  if (!can(user.role, "map.backup")) return new Response("Non autorizzato", { status: 403 });
  const [spawns, noteNames] = await Promise.all([
    prisma.spawn.findMany({ include: { breed: true, coat: true, createdBy: true }, orderBy: { id: "asc" } }),
    getSetting("mapNoteNames"),
  ]);
  const access = roleAccess(user.role);
  const visible = spawns.filter((s) => {
    if (s.kind === "RARO" && !access.rare) return false;
    if (s.kind === "LEGGENDARIO" && !access.legendary) return false;
    return s.kind === "NOTA" || canSeeBreed(user.role, s.breedId);
  });
  const data = {
    formato: "stalla-ciravolo-mappa",
    versione: 1,
    esportatoIl: new Date().toISOString(),
    esportatoDa: user.username,
    categorieNote: noteNames && typeof noteNames === "object" ? noteNames : {},
    punti: visible.map((s) => ({
      tipo: s.kind,
      titolo: s.title,
      colore: s.color,
      x: s.x,
      y: s.y,
      razza: s.breed?.name ?? null,
      manto: s.coat?.name ?? null,
      posizione: s.location,
      descrizione: s.description,
      note: s.notes,
      autore: s.createdBy.username,
      creatoIl: s.createdAt.toISOString(),
    })),
  };
  await audit(user, "ESPORTA_MAPPA", "Mappa", null, `Esportati ${data.punti.length} punti della mappa`);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mappa-spawn-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
