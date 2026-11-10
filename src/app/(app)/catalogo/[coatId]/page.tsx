import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatMeta, statRows, imageUrl } from "@/lib/catalog";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Panel, TableWrap } from "@/components/ui";
import { StatBars } from "@/components/StatBars";

export const metadata = { title: "Scheda manto" };

const FIELD_LABEL: Record<string, string> = {
  govListPrice: "Listino Gov", basePriceA: "Base 5-10", basePriceB: "Base 11-15", trainingPrice: "Addestramento",
  salePriceA: "Vendita 5-10", salePriceB: "Vendita 11-16", governmentPrice: "Governo",
};

export default async function CoatPage({ params }: { params: Promise<{ coatId: string }> }) {
  const user = await requireUser("catalog.view");
  const { coatId } = await params;
  const coat = await prisma.coat.findUnique({
    where: { id: Number(coatId) || 0 },
    include: {
      breed: { include: { coats: { where: { archived: false }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } } } },
      stats: true,
      priceHistory: { orderBy: { changedAt: "desc" }, take: 20, include: { changedBy: { select: { displayName: true } } } },
    },
  });
  if (!coat) notFound();
  const [s, meta, inStable] = await Promise.all([
    getSettings(),
    getStatMeta(),
    prisma.horse.count({ where: { coatId: coat.id, status: "IN_STALLA" } }),
  ]);
  const admin = can(user.role, "catalog.manage");
  return (
    <>
      <PageHeader
        title={coat.breed.name}
        subtitle={<>Manto <b className="not-italic">{coat.name}</b>{coat.breed.isCustom ? " · razza personalizzata" : ""}</>}
        actions={
          <>
            <Link href={`/catalogo#razza-${coat.breedId}`} className="btn btn-ghost !bg-paper/80">← Catalogo</Link>
            {can(user.role, "horses.capture") && <Link href={`/stalla/nuovo?coat=${coat.id}`} className="btn btn-primary">Registra cattura</Link>}
            {admin && <Link href={`/admin/catalogo/manto/${coat.id}`} className="btn btn-gold">Modifica</Link>}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Panel pad={false} className="overflow-hidden">
            <div className="aspect-[16/10] bg-[#cdb180]/50">
              {coat.imagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl(coat.imagePath)!} alt={coat.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center title-fell text-ink-soft/60">Immagine non ancora caricata</div>
              )}
            </div>
          </Panel>
          {(coat.description || coat.breed.description || coat.notes) && (
            <Panel title="Descrizione">
              {coat.breed.description && <p className="mb-2 italic">{coat.breed.description}</p>}
              {coat.description && <p className="whitespace-pre-wrap">{coat.description}</p>}
              {coat.notes && <p className="mt-2 text-ink-soft whitespace-pre-wrap">{coat.notes}</p>}
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          <Panel title="Statistiche">
            <StatBars stats={statRows(meta, coat.stats)} />
            <p className="mt-3 text-[13px] text-ink-soft italic">Valore massimo di ogni barra = miglior cavallo del catalogo.</p>
          </Panel>
          <Panel title="Prezzi">
            <div className="grid grid-cols-2 gap-y-1.5 text-[15.5px]">
              <span className="text-ink-soft">Vendita {s.minSaleAge}-{s.bracketAMax} anni</span><b className="text-right">{money(coat.salePriceA)}</b>
              <span className="text-ink-soft">Vendita {s.bracketAMax + 1}-{s.bracketBMax} anni</span><b className="text-right">{money(coat.salePriceB)}</b>
              <span className="text-ink-soft">Oltre {s.bracketBMax} anni</span><b className="text-right">Libero</b>
              <span className="text-ink-soft">Vendita al Governo</span><b className="text-right text-blood">{money(coat.governmentPrice)}</b>
              <span className="col-span-2 mt-2 border-t border-dashed border-[#bfa476] pt-2 label">Dettaglio</span>
              <span className="text-ink-soft">Listino Gov (acquisto al blip)</span><span className="text-right">{money(coat.govListPrice)}</span>
              <span className="text-ink-soft">Base 5-10 anni</span><span className="text-right">{money(coat.basePriceA)}</span>
              <span className="text-ink-soft">Base 11-15 anni</span><span className="text-right">{money(coat.basePriceB)}</span>
              <span className="text-ink-soft">Addestramento</span><span className="text-right">{money(coat.trainingPrice)}</span>
            </div>
            <p className="mt-3 text-[14px]">In stalla ora: <b>{inStable}</b></p>
          </Panel>
          <Panel title="Altri manti della razza">
            <div className="flex flex-wrap gap-2">
              {coat.breed.coats.map((c) => (
                <Link key={c.id} href={`/catalogo/${c.id}`} className={`badge ${c.id === coat.id ? "badge-gold" : "badge-ink"} !text-[13px]`}>{c.name}</Link>
              ))}
            </div>
          </Panel>
          {admin && coat.priceHistory.length > 0 && (
            <Panel title="Storico prezzi">
              <TableWrap>
                <table className="ledger">
                  <thead><tr><th>Data</th><th>Campo</th><th className="num">Da</th><th className="num">A</th><th>Utente</th></tr></thead>
                  <tbody>
                    {coat.priceHistory.map((h) => (
                      <tr key={h.id}><td className="whitespace-nowrap">{dateTime(h.changedAt)}</td><td>{FIELD_LABEL[h.field] ?? h.field}</td><td className="num">{money(h.oldValue)}</td><td className="num">{money(h.newValue)}</td><td>{h.changedBy?.displayName ?? "Import"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
