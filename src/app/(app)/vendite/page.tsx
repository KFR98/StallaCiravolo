import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { money, dateTime, TZ } from "@/lib/format";
import { formatAge } from "@/lib/age";
import { SEX_LABEL } from "@/lib/horses";
import { PageHeader, Panel, Empty, TableWrap, StatTile } from "@/components/ui";
import { SaleTypeBadge } from "@/components/StatusBadge";
import { SaleAdmin } from "./SaleAdmin";
import clsx from "clsx";

export const metadata = { title: "Registro vendite" };

type SP = { venditore?: string; da?: string; a?: string; razza?: string; manto?: string; tipo?: string; min?: string; max?: string; annullate?: string; evidenzia?: string; pagina?: string };

const PAGE = 100;

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("horses.view");
  const sp = await searchParams;
  const all = can(user.role, "sales.viewAll");
  const where: Prisma.SaleWhereInput = {};
  if (!all) where.sellerId = user.id;
  else if (sp.venditore) where.sellerId = Number(sp.venditore);
  if (sp.annullate !== "1") where.voided = false;
  if (sp.tipo === "STALLA" || sp.tipo === "GOVERNO") where.type = sp.tipo;
  if (sp.razza) where.breedName = { contains: sp.razza };
  if (sp.manto) where.coatName = { contains: sp.manto };
  const soldAt: Prisma.DateTimeFilter = {};
  if (sp.da && /^\d{4}-\d{2}-\d{2}$/.test(sp.da)) soldAt.gte = fromZonedTime(sp.da + "T00:00:00", TZ);
  if (sp.a && /^\d{4}-\d{2}-\d{2}$/.test(sp.a)) soldAt.lte = fromZonedTime(sp.a + "T23:59:59", TZ);
  if (soldAt.gte || soldAt.lte) where.soldAt = soldAt;
  const price: Prisma.DecimalFilter = {};
  if (sp.min && Number.isFinite(Number(sp.min))) price.gte = Number(sp.min);
  if (sp.max && Number.isFinite(Number(sp.max))) price.lte = Number(sp.max);
  if (price.gte != null || price.lte != null) where.finalPrice = price;
  const page = Math.max(1, Number(sp.pagina) || 1);

  const [sales, count, agg, sellers, breeds] = await Promise.all([
    prisma.sale.findMany({ where, orderBy: { soldAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    prisma.sale.count({ where }),
    prisma.sale.groupBy({ by: ["type"], where: { ...where, voided: false }, _sum: { finalPrice: true }, _count: true }),
    all ? prisma.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : Promise.resolve([]),
    prisma.breed.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  const tot = (t?: "STALLA" | "GOVERNO") => agg.filter((a) => !t || a.type === t).reduce((s, a) => s + Number(a._sum.finalPrice ?? 0), 0);
  const cnt = (t?: "STALLA" | "GOVERNO") => agg.filter((a) => !t || a.type === t).reduce((s, a) => s + a._count, 0);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "pagina" && k !== "evidenzia") as [string, string][]);
  const isAdmin = can(user.role, "sales.correct");

  return (
    <>
      <PageHeader
        title={all ? "Registro vendite" : "Le mie vendite"}
        subtitle="Vendite dalla stalla e vendite al Governo. Le vendite non si cancellano: si possono solo annullare."
        actions={can(user.role, "data.export") ? <a href={`/api/export/vendite?${qs}`} className="btn btn-ghost !bg-paper/80">Esporta Excel</a> : undefined}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendite filtrate" value={cnt()} />
        <StatTile label="Incasso totale" value={money(tot())} />
        <StatTile label="Dalla stalla" value={money(tot("STALLA"))} hint={`${cnt("STALLA")} vendite`} />
        <StatTile label="Al Governo" value={money(tot("GOVERNO"))} hint={`${cnt("GOVERNO")} vendite`} />
      </div>
      <Panel className="mb-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {all && (
            <select name="venditore" defaultValue={sp.venditore ?? ""} className="input">
              <option value="">Tutti i dipendenti</option>
              {sellers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </select>
          )}
          <select name="tipo" defaultValue={sp.tipo ?? ""} className="input">
            <option value="">Tutte le tipologie</option>
            <option value="STALLA">Vendite dalla stalla</option>
            <option value="GOVERNO">Vendite al Governo</option>
          </select>
          <input name="razza" defaultValue={sp.razza} className="input" placeholder="Razza" list="razze" />
          <datalist id="razze">{breeds.map((b) => <option key={b.name} value={b.name} />)}</datalist>
          <input name="manto" defaultValue={sp.manto} className="input" placeholder="Manto" />
          <label className="flex items-center gap-2"><span className="label w-8">Dal</span><input type="date" name="da" defaultValue={sp.da} className="input" /></label>
          <label className="flex items-center gap-2"><span className="label w-8">Al</span><input type="date" name="a" defaultValue={sp.a} className="input" /></label>
          <div className="flex gap-2">
            <input name="min" type="number" defaultValue={sp.min} className="input" placeholder="Prezzo min" />
            <input name="max" type="number" defaultValue={sp.max} className="input" placeholder="max" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" name="annullate" value="1" defaultChecked={sp.annullate === "1"} className="size-4 accent-[#5a3a22]" />Annullate</label>
            <button className="btn btn-primary flex-1">Filtra</button>
            <Link href="/vendite" className="btn btn-ghost">✕</Link>
          </div>
        </form>
      </Panel>
      <Panel>
        {sales.length === 0 ? (
          <Empty>Nessuna vendita trovata.</Empty>
        ) : (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Data e ora</th><th>Tipo</th><th>Cavallo</th><th>Sesso</th><th>Targa</th><th>Età</th><th>Venditore</th><th className="num">Listino</th><th className="num">Sconto</th><th className="num">Prezzo</th>{isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className={clsx(String(s.id) === sp.evidenzia && "[&>td]:bg-gold-bright/25", s.voided && "opacity-55 line-through decoration-blood/60")}>
                    <td className="whitespace-nowrap">{dateTime(s.soldAt)}</td>
                    <td><SaleTypeBadge type={s.type} /></td>
                    <td>
                      <Link href={`/stalla/${s.horseId}`} className="underline decoration-dotted">{s.breedName}</Link>
                      <div className="text-[14px] italic text-ink-soft">{s.coatName}{s.buyerName ? ` · a ${s.buyerName}` : ""}</div>
                      {s.voided && <div className="text-[13px] text-blood no-underline">Annullata: {s.voidReason}</div>}
                    </td>
                    <td>{SEX_LABEL[s.sex]}</td>
                    <td className="font-semibold">{s.plate}</td>
                    <td className="whitespace-nowrap">{formatAge(Number(s.ageAtSale))}</td>
                    <td>{s.sellerName}</td>
                    <td className="num">{money(s.listPrice)}</td>
                    <td className="num">{s.discountValue ? (s.discountType === "PERCENTUALE" ? `${Number(s.discountValue)}%` : money(s.discountValue)) : "—"}</td>
                    <td className="num font-bold">{money(s.finalPrice)}</td>
                    {isAdmin && (
                      <td>
                        <SaleAdmin
                          sale={{ id: s.id, finalPrice: Number(s.finalPrice), sellerId: s.sellerId, buyerName: s.buyerName, notes: s.notes, soldAt: s.soldAt.toISOString(), voided: s.voided, type: s.type }}
                          sellers={sellers}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {count > PAGE && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-ink-soft">Pagina {page} di {Math.ceil(count / PAGE)} · {count} vendite</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn btn-ghost btn-sm" href={`/vendite?${qs}&pagina=${page - 1}`}>← Precedenti</Link>}
              {page * PAGE < count && <Link className="btn btn-ghost btn-sm" href={`/vendite?${qs}&pagina=${page + 1}`}>Successive →</Link>}
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
