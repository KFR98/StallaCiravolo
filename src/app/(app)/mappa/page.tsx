import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getBreedOptions, imageUrl } from "@/lib/catalog";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SpawnMapLoader } from "./SpawnMapLoader";

export const metadata = { title: "Mappa degli spawn" };

export default async function MapPage() {
  const user = await requireUser("map.view");
  const [spawns, breeds] = await Promise.all([
    prisma.spawn.findMany({ include: { breed: true, coat: true, createdBy: true }, orderBy: { createdAt: "desc" } }),
    getBreedOptions(),
  ]);
  return (
    <>
      <PageHeader title="Mappa degli spawn" subtitle="Cavalli avvistati, possibili cavalli e note, condivisi da tutta la stalla." />
      <SpawnMapLoader
        spawns={spawns.map((s) => ({
          id: s.id, kind: s.kind, title: s.title, color: s.color, x: s.x, y: s.y, breedId: s.breedId, coatId: s.coatId,
          breed: s.breed?.name ?? (s.kind === "CAVALLO" ? "Razza sconosciuta" : null), coat: s.coat?.name ?? null, image: imageUrl(s.coat?.imagePath),
          location: s.location, description: s.description, notes: s.notes,
          author: s.createdBy.displayName, createdAt: dateTime(s.createdAt), mine: s.createdById === user.id,
        }))}
        breeds={breeds}
        perms={{ add: can(user.role, "map.add"), manage: can(user.role, "map.manage") }}
      />
    </>
  );
}
