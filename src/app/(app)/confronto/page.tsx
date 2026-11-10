import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatMeta, imageUrl } from "@/lib/catalog";
import { PageHeader } from "@/components/ui";
import { CompareTable, type CompareRow } from "./CompareTable";

export const metadata = { title: "Confronto prezzi" };

export default async function ComparePage() {
  await requireUser("prices.view");
  const [coats, s, meta] = await Promise.all([
    prisma.coat.findMany({ where: { archived: false, breed: { archived: false } }, include: { breed: true, stats: true } }),
    getSettings(),
    getStatMeta(),
  ]);
  const rows: CompareRow[] = coats.map((c) => ({
    id: c.id,
    breed: c.breed.name,
    coat: c.name,
    image: imageUrl(c.imagePath),
    salePriceA: c.salePriceA == null ? null : Number(c.salePriceA),
    salePriceB: c.salePriceB == null ? null : Number(c.salePriceB),
    governmentPrice: c.governmentPrice == null ? null : Number(c.governmentPrice),
    govListPrice: c.govListPrice == null ? null : Number(c.govListPrice),
    statTotal: c.stats.reduce((t, x) => t + Number(x.value ?? 0), 0),
  }));
  const maxTotal = meta.reduce((t, m) => t + m.max, 0);
  return (
    <>
      <PageHeader title="Confronto prezzi" subtitle="Confronta rapidamente razze e manti: ordina, filtra per fascia di prezzo e cerca." />
      <CompareTable rows={rows} labels={{ a: `${s.minSaleAge}-${s.bracketAMax} anni`, b: `${s.bracketAMax + 1}-${s.bracketBMax} anni` }} maxTotal={maxTotal} />
    </>
  );
}
