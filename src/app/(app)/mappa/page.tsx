import { requireUser } from "@/lib/auth";
import { can, canSeeBreed, roleAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getBreedOptions, imageUrl } from "@/lib/catalog";
import { getSetting, getSettings } from "@/lib/settings";
import { getTilesMeta } from "@/lib/map-tiles";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SpawnMapLoader } from "./SpawnMapLoader";

export const metadata = { title: "Mappa degli spawn" };
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const user = await requireUser("map.view");
  const [spawns, breeds, noteNames, tilesMeta, extraZoom, settings] = await Promise.all([
    prisma.spawn.findMany({ include: { breed: true, coat: true, createdBy: true }, orderBy: { createdAt: "desc" } }),
    getBreedOptions(),
    getSetting("mapNoteNames"),
    getTilesMeta(),
    getSetting("mapExtraZoom"),
    getSettings(),
  ]);
  // Razze visibili per il ruolo (e rari/leggendari): il resto non arriva nemmeno al browser
  const access = roleAccess(user.role);
  const visibleSpawns = spawns.filter((s) => {
    if (s.kind === "RARO" && !access.rare) return false;
    if (s.kind === "LEGGENDARIO" && !access.legendary) return false;
    return s.kind === "NOTA" || canSeeBreed(user.role, s.breedId);
  });
  const visibleBreeds = breeds.filter((b) => canSeeBreed(user.role, b.id));
  const tiles = tilesMeta ? { ...tilesMeta, extra: Number(extraZoom) || 0 } : null;
  return (
    <>
      <PageHeader title="Mappa degli spawn" subtitle="Cavalli avvistati, possibili cavalli e note, condivisi da tutta la stalla." />
      <SpawnMapLoader
        key={tiles ? `${tiles.v}-${tiles.extra}` : "semplice"}
        spawns={visibleSpawns.map((s) => ({
          id: s.id, kind: s.kind, title: s.title, color: s.color, x: s.x, y: s.y, breedId: s.breedId, coatId: s.coatId,
          breed: s.breed?.name ?? (s.kind === "CAVALLO" ? "Razza sconosciuta" : null), coat: s.coat?.name ?? null, image: imageUrl(s.coat?.imagePath),
          location: s.location, description: s.description, notes: s.notes,
          author: s.createdBy.displayName, createdAt: dateTime(s.createdAt), mine: s.createdById === user.id,
        }))}
        breeds={visibleBreeds}
        tiles={tiles}
        colors={{ rare: settings.rareColor, legendary: settings.legendaryColor }}
        noteNames={noteNames && typeof noteNames === "object" ? noteNames : {}}
        perms={{ add: can(user.role, "map.add"), manage: can(user.role, "map.manage"), exportImage: can(user.role, "map.exportImage"), backup: can(user.role, "map.backup") }}
      />
    </>
  );
}
