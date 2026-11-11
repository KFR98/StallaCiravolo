import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatMeta, statRows, imageUrl, coatScore } from "@/lib/catalog";
import { money, dateTime } from "@/lib/format";
import { Card, HorseThumb, HorseGlyph } from "@/components/ui";
import { StatBars, Rating } from "@/components/StatBars";

export const metadata = { title: "Scheda manto" };

const FIELD_LABEL: Record<string, string> = {
  govListPrice: "Listino Gov", basePriceA: "Base 5-10", basePriceB: "Base 11-15", trainingPrice: "Addestramento",
  salePriceA: "Vendita 5-10", salePriceB: "Vendita 11-16", governmentPrice: "Vendita al blip",
};

export default async function CoatPage({ params }: { params: Promise<{ coatId: string }> }) {
  const user = await requireUser("catalog.view");
  const { coatId } = await params;
  const coat = await prisma.coat.findUnique({
    where: { id: Number(coatId) || 0 },
    include: {
      breed: { include: { coats: { where: { archived: false }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true, imagePath: true } } } },
      stats: true,
      priceHistory: { orderBy: { changedAt: "desc" }, take: 20, include: { changedBy: { select: { displayName: true } } } },
    },
  });
  if (!coat) notFound();
  const [s, meta, inStable] = await Promise.all([getSettings(), getStatMeta(), prisma.horse.count({ where: { coatId: coat.id, status: "IN_STALLA" } })]);
  const admin = can(user.role, "catalog.manage");
  const img = imageUrl(coat.imagePath);
  return (
    <>
      <Link href="/catalogo" className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Catalogo</Link>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{coat.breed.name}{coat.breed.isCustom ? " · mod" : ""}</div>
          <h1 className="h-display text-[34px]">{coat.name}</h1>
          <div className="mt-1"><Rating score={coatScore(meta, coat.stats)} /></div>
        </div>
        {admin && <Link href={`/admin/catalogo/manto/${coat.id}`} className="btn btn-secondary">Modifica</Link>}
      </header>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card pad={false} className="overflow-hidden">
            <div className="aspect-[16/10] bg-surface-3">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={`${coat.breed.name} ${coat.name}`} className="h-full w-full object-cover" />
              ) : <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-3"><HorseGlyph size={56} />Immagine non ancora caricata</div>}
            </div>
          </Card>
          {(coat.description || coat.breed.description || coat.notes) && (
            <Card title="Descrizione">
              {coat.breed.description && <p className="mb-2 text-fg-2">{coat.breed.description}</p>}
              {coat.description && <p className="whitespace-pre-wrap">{coat.description}</p>}
              {coat.notes && <p className="mt-2 whitespace-pre-wrap text-fg-2">{coat.notes}</p>}
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card title="Statistiche"><StatBars stats={statRows(meta, coat.stats)} /></Card>
          <Card title="Prezzi">
            <dl className="grid grid-cols-2 gap-y-1.5 text-[14.5px]">
              <dt className="text-fg-3">Vendita {s.minSaleAge}-{s.bracketAMax} anni</dt><dd className="text-right font-semibold">{money(coat.salePriceA)}</dd>
              <dt className="text-fg-3">Vendita {s.bracketAMax + 1}-{s.bracketBMax} anni</dt><dd className="text-right font-semibold">{money(coat.salePriceB)}</dd>
              <dt className="text-fg-3">Oltre {s.bracketBMax} anni</dt><dd className="text-right">Libero</dd>
              <dt className="text-fg-3">Vendita al blip</dt><dd className="text-right font-semibold">{money(coat.governmentPrice)}</dd>
              <dt className="text-fg-3">Listino Gov</dt><dd className="text-right">{money(coat.govListPrice)}</dd>
            </dl>
            <p className="mt-3 text-[13.5px] text-fg-3">In stalla ora: <b className="text-fg">{inStable}</b></p>
          </Card>
          <Card title="Altri manti della razza">
            <div className="flex flex-wrap gap-2">
              {coat.breed.coats.map((c) => (
                <Link key={c.id} href={`/catalogo/${c.id}`} className="chip" aria-pressed={c.id === coat.id}>
                  <HorseThumb src={imageUrl(c.imagePath)} size={20} className="!rounded" />{c.name}
                </Link>
              ))}
            </div>
          </Card>
          {admin && coat.priceHistory.length > 0 && (
            <Card title="Storico prezzi" pad={false}>
              <table className="tbl">
                <thead><tr><th className="!pl-5">Data</th><th>Campo</th><th className="num">Da</th><th className="num !pr-5">A</th></tr></thead>
                <tbody>
                  {coat.priceHistory.map((h) => (
                    <tr key={h.id}><td className="!pl-5 text-[13.5px]">{dateTime(h.changedAt)}<div className="text-fg-3">{h.changedBy?.displayName ?? "Import"}</div></td><td>{FIELD_LABEL[h.field] ?? h.field}</td><td className="num">{money(h.oldValue)}</td><td className="num !pr-5">{money(h.newValue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
