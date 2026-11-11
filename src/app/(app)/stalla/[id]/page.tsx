import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatMeta, statRows, imageUrl, getBreedOptions } from "@/lib/catalog";
import { horsePricing, sexLabel, pregnancyState } from "@/lib/horses";
import { bracketLabel } from "@/lib/pricing";
import { formatAge, daysUntilAge } from "@/lib/age";
import { money, dateTime, TZ } from "@/lib/format";
import { Card, HorseThumb } from "@/components/ui";
import { StatBars } from "@/components/StatBars";
import { StatusBadge, SaleTypeBadge, PregnancyBadge } from "@/components/StatusBadge";
import { SellForm } from "./SellForm";
import { EditHorseForm, CorrectHorseForm, RemoveHorseForm, RestoreHorseButton, TransferForm, PregnancyPanel } from "./HorseForms";

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
      owner: { select: { id: true, displayName: true } },
      sales: { orderBy: { soldAt: "desc" } },
      transfers: { orderBy: { createdAt: "desc" }, include: { fromUser: true, toUser: true } },
    },
  });
  if (!horse) notFound();
  const s = await getSettings();
  const meta = await getStatMeta();
  const p = horsePricing(horse, s);
  const inStable = horse.status === "IN_STALLA";
  const isOwner = horse.ownerId === user.id || can(user.role, "horses.manageAll");
  const yearProgress = (p.age - Math.floor(p.age)) * 100;
  const preg = pregnancyState(horse);
  const isAdmin = can(user.role, "horses.correct");
  const [users, breeds] = await Promise.all([
    inStable && isOwner || isAdmin ? prisma.user.findMany({ where: { active: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : Promise.resolve([]),
    isAdmin ? getBreedOptions() : Promise.resolve([]),
  ]);
  const img = imageUrl(horse.coat.imagePath);

  return (
    <>
      <Link href={inStable ? "/stalla" : "/stalla?vista=storico"} className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Stalla</Link>
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <HorseThumb src={img} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="h-display text-[30px] sm:text-[34px]">{horse.breed.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-fg-2">
            <span>{horse.coat.name}</span>
            {horse.plate && <span className="badge badge-neutral font-mono">{horse.plate}</span>}
            <StatusBadge status={horse.status} />
            {inStable && <PregnancyBadge dueAt={horse.pregnancyDueAt} />}
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-5">
          <Card pad={false} className="overflow-hidden">
            <div className="grid sm:grid-cols-[1.1fr_1fr]">
              <div className="bg-surface-3">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={`${horse.breed.name} ${horse.coat.name}`} className="h-full max-h-[320px] w-full object-cover" />
                ) : <div className="flex h-full min-h-[200px] items-center justify-center text-fg-3">Immagine non disponibile</div>}
              </div>
              <dl className="card-pad grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2 text-[14.5px]">
                <dt className="text-fg-3">In carico a</dt><dd className="text-right font-semibold">{horse.owner.displayName}</dd>
                <dt className="text-fg-3">Catturato da</dt><dd className="text-right">{horse.capturedBy.displayName}</dd>
                <dt className="text-fg-3">Sesso</dt><dd className="text-right">{sexLabel(horse.sex)}</dd>
                <dt className="text-fg-3">Età</dt><dd className="text-right font-semibold">{inStable ? formatAge(p.age) : horse.initialAge != null ? formatAge(Number(horse.initialAge)) + " (alla cattura)" : "—"}</dd>
                <dt className="text-fg-3">Registrato</dt><dd className="text-right">{dateTime(horse.capturedAt)}</dd>
                {horse.condition && <><dt className="text-fg-3">Condizione</dt><dd className="text-right">{horse.condition}</dd></>}
                {horse.exitedAt && <><dt className="text-fg-3">Uscita</dt><dd className="text-right">{dateTime(horse.exitedAt)}</dd></>}
              </dl>
            </div>
          </Card>

          {inStable && (
            <Card title="Età">
              <div className="flex items-center justify-between text-[14.5px]">
                <b>{formatAge(p.age)}</b>
                <span className="text-fg-3">{Math.floor(p.age) + 1} anni tra {((1 - yearProgress / 100) * s.daysPerYear).toFixed(1)} giorni</span>
              </div>
              <div className="statbar mt-2"><span style={{ width: `${yearProgress}%` }} /></div>
              <p className="mt-2 text-[13.5px] text-fg-3">
                {p.bracket === "TROPPO_GIOVANE" ? `Vendibile tra circa ${daysUntilAge(p.age, s.minSaleAge, s.daysPerYear).toFixed(1)} giorni (a ${s.minSaleAge} anni).` : `Fascia di prezzo: ${bracketLabel(p.bracket, s)}.`}
              </p>
            </Card>
          )}

          {inStable && horse.sex === "FEMMINA" && (
            <Card title="Gravidanza">
              <PregnancyPanel
                horseId={horse.id}
                canEdit={isOwner}
                state={preg}
                since={horse.pregnantSince ? dateTime(horse.pregnantSince) : null}
                due={horse.pregnancyDueAt ? formatInTimeZone(horse.pregnancyDueAt, TZ, "yyyy-MM-dd'T'HH:mm") : null}
                dueText={horse.pregnancyDueAt ? dateTime(horse.pregnancyDueAt) : null}
                days={s.pregnancyDays}
              />
            </Card>
          )}

          <Card title="Statistiche"><StatBars stats={statRows(meta, horse.coat.stats)} /></Card>
          {horse.notes && <Card title="Note"><p className="whitespace-pre-wrap">{horse.notes}</p></Card>}
        </div>

        <div className="space-y-5">
          {inStable && (
            <Card title="Vendi">
              {isOwner ? (
                <SellForm
                  horseId={horse.id}
                  version={horse.version}
                  bracket={p.bracket}
                  bracketText={bracketLabel(p.bracket, s)}
                  listPrice={p.listPrice}
                  canOverride={can(user.role, "sales.overridePrice")}
                  maxDiscount={s.maxDiscountPercent}
                  minSaleAge={s.minSaleAge}
                  pregnant={preg != null}
                />
              ) : (
                <p className="text-fg-2">Questo cavallo è in carico a <b>{horse.owner.displayName}</b>: solo lui può venderlo o passarlo a un altro stalliere.</p>
              )}
            </Card>
          )}

          {inStable && isOwner && (
            <Card title="Passa a un altro stalliere">
              <TransferForm horseId={horse.id} users={users.filter((u) => u.id !== horse.ownerId)} />
            </Card>
          )}

          <Card title="Prezzi del manto">
            <dl className="grid grid-cols-2 gap-y-1.5 text-[14.5px]">
              <dt className="text-fg-3">Vendita {s.minSaleAge}-{s.bracketAMax} anni</dt><dd className="text-right font-semibold">{money(horse.coat.salePriceA)}</dd>
              <dt className="text-fg-3">Vendita {s.bracketAMax + 1}-{s.bracketBMax} anni</dt><dd className="text-right font-semibold">{money(horse.coat.salePriceB)}</dd>
              <dt className="text-fg-3">Oltre {s.bracketBMax} anni</dt><dd className="text-right">Prezzo libero</dd>
              <dt className="text-fg-3">Vendita al blip</dt><dd className="text-right font-semibold">{money(horse.coat.governmentPrice)}</dd>
            </dl>
          </Card>

          {horse.sales.length > 0 && (
            <Card title="Vendita">
              {horse.sales.map((sale) => (
                <div key={sale.id} className="space-y-1 text-[14.5px]">
                  <div className="flex gap-2"><SaleTypeBadge type={sale.type} />{sale.voided && <span className="badge badge-accent">Annullata</span>}</div>
                  <div>{dateTime(sale.soldAt)} · {sale.sellerName}</div>
                  <div className="text-[18px] font-bold">{money(sale.finalPrice)}</div>
                </div>
              ))}
            </Card>
          )}

          {horse.transfers.length > 0 && (
            <Card title="Passaggi">
              <ul className="space-y-1.5 text-[14px]">
                {horse.transfers.map((t) => (
                  <li key={t.id}><span className="text-fg-3">{dateTime(t.createdAt)}</span> · {t.fromUser.displayName} → <b>{t.toUser.displayName}</b>{t.notes ? ` · ${t.notes}` : ""}</li>
                ))}
              </ul>
            </Card>
          )}

          {can(user.role, "horses.edit") && (
            <details className="card">
              <summary className="card-pad cursor-pointer font-semibold">Modifica dati</summary>
              <div className="card-pad !pt-0 space-y-5">
                <EditHorseForm horseId={horse.id} plate={horse.plate ?? ""} condition={horse.condition} notes={horse.notes} />
                {inStable && <div className="border-t border-border pt-4"><RemoveHorseForm horseId={horse.id} /></div>}
              </div>
            </details>
          )}

          {isAdmin && (
            <details className="card">
              <summary className="card-pad cursor-pointer font-semibold">Correzione amministrativa</summary>
              <div className="card-pad !pt-0">
                <CorrectHorseForm horseId={horse.id} breeds={breeds} coatId={horse.coatId} sex={horse.sex} age={Math.round(p.age * 100) / 100} capturedById={horse.capturedById} users={users} />
                {horse.status === "RIMOSSO" && <div className="mt-4"><RestoreHorseButton horseId={horse.id} /></div>}
              </div>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
