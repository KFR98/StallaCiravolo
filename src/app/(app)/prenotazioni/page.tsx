import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getBreedOptions, imageUrl } from "@/lib/catalog";
import { money, dateOnly, dateTime, TZ } from "@/lib/format";
import { PageHeader, Card, Empty, HorseThumb } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ReservationButton } from "./ReservationForm";
import { setReservationStatus, deleteReservation } from "./actions";
import { ActionButton } from "@/components/ActionForm";
import { RES_STATUS } from "./status";

export const metadata = { title: "Bacheca" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ stato?: string; q?: string; mie?: string }> }) {
  const user = await requireUser("reservations.edit");
  const sp = await searchParams;
  const where: Prisma.ReservationWhereInput = {};
  if (sp.stato && sp.stato in RES_STATUS) where.status = sp.stato as never;
  else if (sp.stato !== "tutte") where.status = { notIn: ["AFFARE_CHIUSO", "ANNULLATO"] };
  if (sp.mie === "1") where.assignedToId = user.id;
  if (sp.q) where.OR = [{ title: { contains: sp.q } }, { customerName: { contains: sp.q } }, { notes: { contains: sp.q } }, { plate: { contains: sp.q } }, { missiva: { contains: sp.q } }, { breed: { name: { contains: sp.q } } }, { coat: { name: { contains: sp.q } } }];
  const [items, breeds, users, counts] = await Promise.all([
    prisma.reservation.findMany({ where, orderBy: [{ deliveryDate: "asc" }, { updatedAt: "desc" }], include: { breed: true, coat: true, assignedTo: true, createdBy: true, updatedBy: true }, take: 300 }),
    getBreedOptions(),
    prisma.user.findMany({ where: { active: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    prisma.reservation.groupBy({ by: ["status"], _count: true }),
  ]);
  const canDelete = can(user.role, "reservations.delete");
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { stato: sp.stato, mie: sp.mie, q: sp.q, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/prenotazioni?${p}`;
  };

  return (
    <>
      <PageHeader title="Bacheca" subtitle="Prenotazioni e note condivise: chi ha prenotato cosa, cavalli da catturare, affari in corso. Tutti possono scrivere e modificare." actions={<ReservationButton breeds={breeds} users={users} label="+ Nuova nota" className="btn btn-primary" />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ stato: undefined })} className="chip" aria-pressed={!sp.stato}>Aperte</Link>
        {Object.entries(RES_STATUS).map(([k, v]) => (
          <Link key={k} href={link({ stato: k })} className="chip" aria-pressed={sp.stato === k}>{v.label} <span className="text-fg-3">{counts.find((c) => c.status === k)?._count ?? 0}</span></Link>
        ))}
        <Link href={link({ stato: "tutte" })} className="chip" aria-pressed={sp.stato === "tutte"}>Tutte</Link>
        <Link href={link({ mie: sp.mie === "1" ? undefined : "1" })} className="chip" aria-pressed={sp.mie === "1"}>Assegnate a me</Link>
        <form className="relative ml-auto w-full sm:w-64">
          {sp.stato && <input type="hidden" name="stato" value={sp.stato} />}
          {sp.mie && <input type="hidden" name="mie" value={sp.mie} />}
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input name="q" defaultValue={sp.q} placeholder="Cerca e premi Invio…" className="input !pl-9" aria-label="Cerca nella bacheca" />
        </form>
      </div>
      {items.length === 0 ? <Card><Empty>Nessuna nota in questa vista.</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((r) => {
            const st = RES_STATUS[r.status];
            const balance = r.price != null ? Number(r.price) - Number(r.deposit ?? 0) : null;
            return (
              <article key={r.id} className="card card-pad flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  {r.breed && <HorseThumb src={imageUrl(r.coat?.imagePath)} size={40} />}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16px] font-semibold">{r.title || r.customerName || "Nota"}</h3>
                    {r.breed && <div className="truncate text-[13.5px] text-fg-3">{r.breed.name}{r.coat ? ` · ${r.coat.name}` : ""}</div>}
                  </div>
                  <span className={`badge shrink-0 ${st.cls}`}>{st.label}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[14px]">
                  {r.customerName && <><dt className="text-fg-3">Cliente</dt><dd>{r.customerName}{r.missiva ? ` · ✉ ${r.missiva}` : ""}</dd></>}
                  <dt className="text-fg-3">Stalliere</dt><dd>{r.assignedTo?.displayName ?? <span className="text-fg-3">chiunque</span>}</dd>
                  {r.plate && <><dt className="text-fg-3">Targa</dt><dd className="font-mono">{r.plate}</dd></>}
                  {r.deliveryDate && <><dt className="text-fg-3">Consegna</dt><dd>{dateOnly(r.deliveryDate)}</dd></>}
                  {r.price != null && <><dt className="text-fg-3">Prezzo</dt><dd>{money(r.price)} · acconto {money(r.deposit ?? 0)} · <b>saldo {money(balance)}</b></dd></>}
                </dl>
                {r.notes && <p className="whitespace-pre-wrap text-[14px] text-fg-2">{r.notes}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <ReservationButton breeds={breeds} users={users} label="Modifica" canDelete={canDelete} data={{
                    id: r.id, title: r.title, customerName: r.customerName, missiva: r.missiva, breedId: r.breedId, coatId: r.coatId, plate: r.plate,
                    price: r.price == null ? null : Number(r.price), deposit: r.deposit == null ? null : Number(r.deposit),
                    deliveryDate: r.deliveryDate ? formatInTimeZone(r.deliveryDate, TZ, "yyyy-MM-dd") : null, status: r.status, assignedToId: r.assignedToId, notes: r.notes,
                  }} />
                  <ActionForm action={setReservationStatus} className="flex gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className="input !min-h-8 !w-auto !py-1 !text-[13.5px]" aria-label="Cambia stato">
                      {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button className="btn btn-secondary btn-sm">OK</button>
                  </ActionForm>
                  {canDelete && <ActionButton action={deleteReservation} fields={{ id: r.id }} label="Elimina" className="btn btn-ghost btn-sm" confirm="Eliminare questa nota? L'operazione resta nel registro attività." />}
                  <span className="ml-auto text-[12px] text-fg-3">{r.updatedBy?.displayName ?? r.createdBy.displayName} · {dateTime(r.updatedAt)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
