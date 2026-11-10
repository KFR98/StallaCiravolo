import type { Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getBreedOptions } from "@/lib/catalog";
import { money, dateOnly, dateTime, TZ } from "@/lib/format";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ReservationButton } from "./ReservationForm";
import { setReservationStatus } from "./actions";
import { RES_STATUS } from "./status";
import Link from "next/link";
import clsx from "clsx";

export const metadata = { title: "Note e prenotazioni" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ stato?: string; q?: string; mie?: string }> }) {
  const user = await requireUser("reservations.edit");
  const sp = await searchParams;
  const where: Prisma.ReservationWhereInput = {};
  if (sp.stato && sp.stato in RES_STATUS) where.status = sp.stato as never;
  else if (sp.stato !== "tutte") where.status = { notIn: ["AFFARE_CHIUSO", "ANNULLATO"] };
  if (sp.mie === "1") where.assignedToId = user.id;
  if (sp.q) where.OR = [{ title: { contains: sp.q } }, { customerName: { contains: sp.q } }, { notes: { contains: sp.q } }, { plate: { contains: sp.q } }, { missiva: { contains: sp.q } }];
  const [items, breeds, users, counts] = await Promise.all([
    prisma.reservation.findMany({
      where,
      orderBy: [{ deliveryDate: "asc" }, { updatedAt: "desc" }],
      include: { breed: true, coat: true, assignedTo: true, createdBy: true, updatedBy: true },
      take: 300,
    }),
    getBreedOptions(),
    prisma.user.findMany({ where: { active: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    prisma.reservation.groupBy({ by: ["status"], _count: true }),
  ]);
  const canDelete = can(user.role, "reservations.delete");
  const filterLink = (stato?: string) => `/prenotazioni?${new URLSearchParams({ ...(stato ? { stato } : {}), ...(sp.mie ? { mie: "1" } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Note e prenotazioni"
        subtitle="Bacheca condivisa: chi ha prenotato cosa, cavalli da catturare, affari in corso. Tutti possono scrivere e modificare."
        actions={<ReservationButton breeds={breeds} users={users} label="+ Nuova nota" className="btn btn-gold" />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={filterLink()} className={clsx("btn btn-sm", !sp.stato ? "btn-gold" : "btn-ghost !bg-paper/70")}>Aperte</Link>
        {Object.entries(RES_STATUS).map(([k, v]) => (
          <Link key={k} href={filterLink(k)} className={clsx("btn btn-sm", sp.stato === k ? "btn-gold" : "btn-ghost !bg-paper/70")}>
            {v.label} ({counts.find((c) => c.status === k)?._count ?? 0})
          </Link>
        ))}
        <Link href={filterLink("tutte")} className={clsx("btn btn-sm", sp.stato === "tutte" ? "btn-gold" : "btn-ghost !bg-paper/70")}>Tutte</Link>
        <form className="ml-auto flex gap-2">
          {sp.stato && <input type="hidden" name="stato" value={sp.stato} />}
          <label className="flex items-center gap-1 text-paper"><input type="checkbox" name="mie" value="1" defaultChecked={sp.mie === "1"} className="size-4" />Mie</label>
          <input name="q" defaultValue={sp.q} placeholder="Cerca…" className="input !w-48 !py-1" />
          <button className="btn btn-primary btn-sm">Cerca</button>
        </form>
      </div>
      {items.length === 0 ? <Panel><Empty>Nessuna nota in questa vista.</Empty></Panel> : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((r) => {
            const st = RES_STATUS[r.status];
            const balance = r.price != null ? Number(r.price) - Number(r.deposit ?? 0) : null;
            return (
              <article key={r.id} className="panel panel-pad flex flex-col rise">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="title-fell truncate text-[18px] text-leather">{r.title || r.customerName || "Nota"}</h3>
                    {r.breed && <div className="italic">{r.breed.name}{r.coat ? ` – ${r.coat.name}` : ""}</div>}
                  </div>
                  <span className={clsx("badge shrink-0", st.cls)}>{st.label}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[15px]">
                  {r.customerName && <><dt className="text-ink-soft">Cliente</dt><dd>{r.customerName}{r.missiva ? ` · ✉ ${r.missiva}` : ""}</dd></>}
                  <dt className="text-ink-soft">Stalliere</dt><dd>{r.assignedTo?.displayName ?? <i className="text-ink-soft">tutti</i>}</dd>
                  {r.plate && <><dt className="text-ink-soft">Targa</dt><dd>{r.plate}</dd></>}
                  {r.deliveryDate && <><dt className="text-ink-soft">Consegna</dt><dd>{dateOnly(r.deliveryDate)}</dd></>}
                  {r.price != null && <><dt className="text-ink-soft">Prezzo</dt><dd>{money(r.price)} · acconto {money(r.deposit ?? 0)} · <b>saldo {money(balance)}</b></dd></>}
                </dl>
                {r.notes && <p className="mt-2 whitespace-pre-wrap text-[15px]">{r.notes}</p>}
                <div className="mt-auto pt-3">
                  <div className="text-[12.5px] text-ink-soft italic">Creata da {r.createdBy.displayName} il {dateTime(r.createdAt)}{r.updatedBy ? ` · modificata da ${r.updatedBy.displayName}` : ""}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ReservationButton
                      breeds={breeds}
                      users={users}
                      label="Modifica"
                      canDelete={canDelete}
                      data={{
                        id: r.id, title: r.title, customerName: r.customerName, missiva: r.missiva, breedId: r.breedId, coatId: r.coatId, plate: r.plate,
                        price: r.price == null ? null : Number(r.price), deposit: r.deposit == null ? null : Number(r.deposit),
                        deliveryDate: r.deliveryDate ? formatInTimeZone(r.deliveryDate, TZ, "yyyy-MM-dd") : null, status: r.status, assignedToId: r.assignedToId, notes: r.notes,
                      }}
                    />
                    <ActionForm action={setReservationStatus} className="flex gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="status" defaultValue={r.status} className="input !w-auto !py-1 !text-[14px]">
                        {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm">OK</button>
                    </ActionForm>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
