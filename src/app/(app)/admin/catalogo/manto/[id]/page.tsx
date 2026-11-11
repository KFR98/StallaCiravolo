import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { imageUrl } from "@/lib/catalog";
import { PageHeader, Card } from "@/components/ui";
import { CoatForm } from "./CoatForm";

export const metadata = { title: "Modifica manto" };

export default async function EditCoatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ razza?: string }> }) {
  await requireUser("catalog.manage");
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nuovo";
  const coat = isNew ? null : await prisma.coat.findUnique({ where: { id: Number(id) || 0 }, include: { stats: true, breed: true, _count: { select: { horses: true } } } });
  if (!isNew && !coat) notFound();
  const [breeds, stats] = await Promise.all([
    prisma.breed.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.statDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const n = (v: unknown) => (v == null ? null : Number(v));
  return (
    <>
      <PageHeader
        title={isNew ? "Nuovo manto" : `${coat!.breed.name} – ${coat!.name}`}
        subtitle="Tutti i campi sono modificabili. Lascia vuoto un valore se non è noto: non verrà inventato."
        actions={<Link href="/admin/catalogo" className="btn btn-ghost ">← Catalogo</Link>}
      />
      <Card>
        <CoatForm
          breeds={breeds}
          stats={stats.map((s) => ({ id: s.id, label: s.label }))}
          coat={
            coat
              ? {
                  id: coat.id, breedId: coat.breedId, name: coat.name, description: coat.description, notes: coat.notes, sortOrder: coat.sortOrder, archived: coat.archived,
                  image: imageUrl(coat.imagePath), horses: coat._count.horses, originalName: coat.originalName,
                  prices: { govListPrice: n(coat.govListPrice), basePriceA: n(coat.basePriceA), basePriceB: n(coat.basePriceB), trainingPrice: n(coat.trainingPrice), salePriceA: n(coat.salePriceA), salePriceB: n(coat.salePriceB), governmentPrice: n(coat.governmentPrice) },
                  stats: Object.fromEntries(coat.stats.map((s) => [s.statId, n(s.value)])),
                }
              : { breedId: Number(sp.razza) || undefined }
          }
        />
      </Card>
    </>
  );
}
