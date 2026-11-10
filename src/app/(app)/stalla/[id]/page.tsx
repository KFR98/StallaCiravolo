import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatMeta, statRows, imageUrl, getBreedOptions } from "@/lib/catalog";
import { horsePricing, SEX_LABEL } from "@/lib/horses";
import { bracketLabel } from "@/lib/pricing";
import { formatAge, daysUntilAge } from "@/lib/age";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Panel } from "@/components/ui";
import { StatBars } from "@/components/StatBars";
import { StatusBadge, SaleTypeBadge } from "@/components/StatusBadge";
import { SellForm } from "./SellForm";
import { EditHorseForm, CorrectHorseForm, RemoveHorseForm, RestoreHorseButton } from "./HorseForms";

export const metadata = { title: "Scheda cavallo" };

export default async function HorsePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("horses.view");
  const { id } = await params;
  const horse = await prisma.horse.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      breed: true,
      coat: { include: { stats: true } },
      capturedBy: { select: { id: true, displayName: true } },
      sales: { orderBy: { soldAt: "desc" }, include: { seller: { select: { displayName: true } } } },
    },
  });
  if (!horse) notFound();
  const s = await getSettings();
  const meta = await getStatMeta();
  const p = horsePricing(horse, s);
  const inStable = horse.status === "IN_STALLA";
  const nextYear = Math.floor(p.age) + 1;
  const yearProgress = (p.age - Math.floor(p.age)) * 100;
  const daysToSell = daysUntilAge(p.age, s.minSaleAge, s.daysPerYear);
  const needsUsers = can(user.role, "horses.correct");
  const [users, breeds] = needsUsers
    ? await Promise.all([
        prisma.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
        getBreedOptions(),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        title={`${horse.breed.name}`}
        subtitle={<>Manto <b className="not-italic">{horse.coat.name}</b> · Targa {horse.plate}</>}
        actions={<Link href={inStable ? "/stalla" : "/stalla?vista=storico"} className="btn btn-ghost !bg-paper/80">← Torna all&apos;elenco</Link>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Panel pad={false} className="overflow-hidden">
            <div className="grid sm:grid-cols-[1.2fr_1fr]">
              <div className="bg-[#cdb180]/50">
                {horse.coat.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(horse.coat.imagePath)!} alt={horse.coat.name} className="h-full max-h-[340px] w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[220px] items-center justify-center text-6xl text-ink-soft/30">♞</div>
                )}
              </div>
              <div className="panel-pad space-y-2 text-[15.5px]">
                <div className="flex flex-wrap gap-2"><StatusBadge status={horse.status} />{horse.condition && <span className="badge badge-ink">{horse.condition}</span>}</div>
                <Row k="Sesso" v={SEX_LABEL[horse.sex]} />
                <Row k="Targa" v={<b>{horse.plate}</b>} />
                <Row k="Età attuale" v={inStable ? <b>{formatAge(p.age)}</b> : "—"} />
                <Row k="Età all'ingresso" v={formatAge(Number(horse.initialAge))} />
                <Row k="Catturato da" v={horse.capturedBy.displayName} />
                <Row k="Registrato il" v={dateTime(horse.capturedAt)} />
                {horse.depositedAt && <Row k="Ingresso in stalla" v={dateTime(horse.depositedAt)} />}
                {horse.exitedAt && <Row k="Uscita" v={`${dateTime(horse.exitedAt)}${horse.exitReason ? " · " + horse.exitReason : ""}`} />}
              </div>
            </div>
          </Panel>

          {inStable && (
            <Panel title="Avanzamento età">
              <div className="flex items-center justify-between text-[15px]">
                <span>{formatAge(p.age)}</span>
                <span className="text-ink-soft">→ {nextYear} anni tra {((1 - yearProgress / 100) * s.daysPerYear).toFixed(1)} giorni</span>
              </div>
              <div className="statbar mt-2 !h-[11px]"><span style={{ width: `${yearProgress}%` }} /></div>
              <p className="mt-2 text-[14px] text-ink-soft italic">
                1 anno ogni {s.daysPerYear} giorni reali.{" "}
                {p.bracket === "TROPPO_GIOVANE" ? `Vendibile tra circa ${daysToSell.toFixed(1)} giorni (a ${s.minSaleAge} anni).` : `Fascia di prezzo: ${bracketLabel(p.bracket, s)}.`}
              </p>
            </Panel>
          )}

          <Panel title="Statistiche del manto">
            <StatBars stats={statRows(meta, horse.coat.stats)} />
          </Panel>

          {horse.notes && (
            <Panel title="Note">
              <p className="whitespace-pre-wrap">{horse.notes}</p>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          {inStable && can(user.role, "horses.sell") && (
            <Panel title="Vendi cavallo">
              <SellForm
                horseId={horse.id}
                version={horse.version}
                bracket={p.bracket}
                bracketText={bracketLabel(p.bracket, s)}
                listPrice={p.listPrice}
                canOverride={can(user.role, "sales.overridePrice")}
                maxDiscount={s.maxDiscountPercent}
                minSaleAge={s.minSaleAge}
              />
            </Panel>
          )}

          <Panel title="Listino del manto">
            <div className="grid grid-cols-2 gap-y-1.5 text-[15.5px]">
              <span className="text-ink-soft">Vendita {s.minSaleAge}-{s.bracketAMax} anni</span><b className="text-right">{money(horse.coat.salePriceA)}</b>
              <span className="text-ink-soft">Vendita {s.bracketAMax + 1}-{s.bracketBMax} anni</span><b className="text-right">{money(horse.coat.salePriceB)}</b>
              <span className="text-ink-soft">Oltre {s.bracketBMax} anni</span><b className="text-right">Prezzo libero</b>
              <span className="text-ink-soft">Vendita al Governo</span><b className="text-right">{money(horse.coat.governmentPrice)}</b>
              <span className="text-ink-soft">Listino Gov (acquisto blip)</span><span className="text-right">{money(horse.coat.govListPrice)}</span>
            </div>
          </Panel>

          {horse.sales.length > 0 && (
            <Panel title="Vendita">
              {horse.sales.map((sale) => (
                <div key={sale.id} className="space-y-1 text-[15.5px]">
                  <div className="flex flex-wrap gap-2"><SaleTypeBadge type={sale.type} />{sale.voided && <span className="badge badge-red">Annullata</span>}</div>
                  <Row k="Data" v={dateTime(sale.soldAt)} />
                  <Row k="Venduto da" v={sale.sellerName} />
                  <Row k="Prezzo finale" v={<b>{money(sale.finalPrice)}</b>} />
                  {sale.discountValue && <Row k="Sconto" v={sale.discountType === "PERCENTUALE" ? `${Number(sale.discountValue)}%` : money(sale.discountValue)} />}
                  {sale.buyerName && <Row k="Acquirente" v={sale.buyerName} />}
                  <Link href={`/vendite?evidenzia=${sale.id}`} className="mt-1 inline-block underline decoration-dotted">Apri nel registro vendite</Link>
                </div>
              ))}
            </Panel>
          )}

          {can(user.role, "horses.edit") && (
            <Panel title="Dati operativi">
              <EditHorseForm horseId={horse.id} plate={horse.plate} condition={horse.condition} notes={horse.notes} />
              {inStable && (
                <div className="mt-5 border-t border-dashed border-[#bfa476] pt-4">
                  <RemoveHorseForm horseId={horse.id} />
                </div>
              )}
            </Panel>
          )}

          {needsUsers && (
            <Panel title="Correzione amministrativa">
              <CorrectHorseForm
                horseId={horse.id}
                breeds={breeds}
                coatId={horse.coatId}
                sex={horse.sex}
                age={Math.round(p.age * 100) / 100}
                capturedById={horse.capturedById}
                users={users}
              />
              {horse.status === "RIMOSSO" && <div className="mt-4"><RestoreHorseButton horseId={horse.id} /></div>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-[#c9ae7c]/70 pb-1">
      <span className="text-ink-soft">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
