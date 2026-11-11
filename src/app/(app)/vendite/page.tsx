import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { imageUrl } from "@/lib/catalog";
import { money, dateTime, TZ } from "@/lib/format";
import { formatAge } from "@/lib/age";
import { PageHeader, Card, Empty, StatTile, Tabs, HorseName, HorseThumb } from "@/components/ui";
import { SaleTypeBadge } from "@/components/StatusBadge";
import { SaleAdmin, ItemSaleAdmin } from "./SaleAdmin";
import clsx from "clsx";

export const metadata = { title: "Vendite" };

type SP = { tab?: string; vista?: string; venditore?: string; da?: string; a?: string; q?: string; tipo?: string; min?: string; max?: string; annullate?: string; evidenzia?: string; pagina?: string };
const PAGE = 100;

function dateRange(sp: SP) {
  const r: Prisma.DateTimeFilter = {};
  if (sp.da && /^\d{4}-\d{2}-\d{2}$/.test(sp.da)) r.gte = fromZonedTime(sp.da + "T00:00:00", TZ);
  if (sp.a && /^\d{4}-\d{2}-\d{2}$/.test(sp.a)) r.lte = fromZonedTime(sp.a + "T23:59:59", TZ);
  return r.gte || r.lte ? r : undefined;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("horses.view");
  const sp = await searchParams;
  const all = can(user.role, "sales.viewAll");
  const isAdmin = can(user.role, "sales.correct");
  const oggetti = sp.tab === "oggetti";
  const sellers = all ? await prisma.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : [];
  const sellerId = !all ? user.id : sp.venditore ? Number(sp.venditore) : undefined;
  const soldAt = dateRange(sp);
  const keep = (extra: Record<string, string>) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["pagina", "evidenzia"].includes(k))), ...extra }).toString();

  const filters = (
    <form className="card mb-5 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_auto]">
      {oggetti && <input type="hidden" name="tab" value="oggetti" />}
      <input name="q" defaultValue={sp.q} className="input" placeholder={oggetti ? "Cerca oggetto o acquirente…" : "Cerca razza, manto, targa, acquirente…"} />
      {all ? (
        <select name="venditore" defaultValue={sp.venditore ?? ""} className="input">
          <option value="">Tutti gli stallieri</option>
          {sellers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </select>
      ) : <div className="hidden lg:block" />}
      <input type="date" name="da" defaultValue={sp.da} className="input" aria-label="Dal" title="Dal" />
      <input type="date" name="a" defaultValue={sp.a} className="input" aria-label="Al" title="Al" />
      <div className="flex gap-2"><button className="btn btn-secondary flex-1">Filtra</button><Link href={oggetti ? "/vendite?tab=oggetti" : "/vendite"} className="btn btn-ghost">Azzera</Link></div>
      {!oggetti && (
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
          {[["", "Tutte"], ["STALLA", "Stalla"], ["GOVERNO", "Blip Governo"]].map(([k, l]) => (
            <Link key={k} className="chip" aria-pressed={(sp.tipo ?? "") === k} href={`/vendite?${keep({ tipo: k })}`}>{l}</Link>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <input name="min" type="number" defaultValue={sp.min} className="input !min-h-8 !w-28 !py-1" placeholder="Prezzo min" />
          <input name="max" type="number" defaultValue={sp.max} className="input !min-h-8 !w-28 !py-1" placeholder="Prezzo max" />
          <label className="ml-auto flex items-center gap-2 text-[14px] text-fg-2"><input type="checkbox" name="annullate" value="1" defaultChecked={sp.annullate === "1"} />Mostra annullate</label>
          {sp.tipo && <input type="hidden" name="tipo" value={sp.tipo} />}
        </div>
      )}
    </form>
  );

  const tabs = <Tabs active={oggetti ? "oggetti" : "cavalli"} items={[{ key: "cavalli", href: "/vendite", label: "Cavalli" }, { key: "oggetti", href: "/vendite?tab=oggetti", label: "Oggetti" }]} />;
  const header = (
    <PageHeader
      title={all ? "Vendite" : "Le mie vendite"}
      subtitle="Le vendite non si cancellano: l'amministratore può correggerle o annullarle."
      actions={can(user.role, "data.export") && !oggetti ? <a href={`/api/export/vendite?${keep({})}`} className="btn btn-secondary">Esporta Excel</a> : undefined}
    />
  );

  if (oggetti) {
    const where: Prisma.ItemSaleWhereInput = { ...(sellerId ? { sellerId } : {}), ...(soldAt ? { soldAt } : {}), ...(sp.annullate === "1" ? {} : { voided: false }) };
    if (sp.q) where.OR = [{ buyerName: { contains: sp.q } }, { lines: { some: { itemName: { contains: sp.q } } } }];
    const [list, agg] = await Promise.all([
      prisma.itemSale.findMany({ where, orderBy: { soldAt: "desc" }, take: 200, include: { lines: true } }),
      prisma.itemSale.aggregate({ where: { ...where, voided: false }, _sum: { total: true }, _count: true }),
    ]);
    return (
      <>
        {header}{tabs}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Vendite di oggetti" value={agg._count} />
          <StatTile label="Incasso" value={money(agg._sum.total ?? 0)} tone="accent" />
        </div>
        {filters}
        <Card pad={false}>
          {list.length === 0 ? <Empty>Nessuna vendita di oggetti.</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th className="!pl-5">Data</th><th>Oggetti</th><th>Venditore</th><th>Acquirente</th><th className="num">Totale</th>{isAdmin && <th className="!pr-5" />}</tr></thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} className={s.voided ? "opacity-50" : ""}>
                      <td className="!pl-5 whitespace-nowrap">{dateTime(s.soldAt)}</td>
                      <td className={s.voided ? "line-through" : ""}>{s.lines.map((l) => `${l.quantity}× ${l.itemName}`).join(", ")}{s.voided && <div className="text-[12.5px] text-accent-text no-underline">Annullata: {s.voidReason}</div>}</td>
                      <td>{s.sellerName}</td>
                      <td>{s.buyerName ?? "—"}</td>
                      <td className="num font-bold">{money(s.total)}</td>
                      {isAdmin && <td className="!pr-5 text-right">{!s.voided && <ItemSaleAdmin id={s.id} />}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  const where: Prisma.SaleWhereInput = {};
  if (sellerId) where.sellerId = sellerId;
  if (sp.annullate !== "1") where.voided = false;
  if (sp.tipo === "STALLA" || sp.tipo === "GOVERNO") where.type = sp.tipo;
  if (sp.q) where.OR = [{ breedName: { contains: sp.q } }, { coatName: { contains: sp.q } }, { plate: { contains: sp.q } }, { buyerName: { contains: sp.q } }];
  if (soldAt) where.soldAt = soldAt;
  const price: Prisma.DecimalFilter = {};
  if (sp.min && Number.isFinite(Number(sp.min))) price.gte = Number(sp.min);
  if (sp.max && Number.isFinite(Number(sp.max))) price.lte = Number(sp.max);
  if (price.gte != null || price.lte != null) where.finalPrice = price;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const [sales, count, agg] = await Promise.all([
    prisma.sale.findMany({ where, orderBy: { soldAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE, include: { horse: { include: { coat: { select: { imagePath: true } } } } } }),
    prisma.sale.count({ where }),
    prisma.sale.groupBy({ by: ["type"], where: { ...where, voided: false }, _sum: { finalPrice: true }, _count: true }),
  ]);
  const tot = (t?: "STALLA" | "GOVERNO") => agg.filter((a) => !t || a.type === t).reduce((s, a) => s + Number(a._sum.finalPrice ?? 0), 0);
  const cnt = (t?: "STALLA" | "GOVERNO") => agg.filter((a) => !t || a.type === t).reduce((s, a) => s + a._count, 0);

  return (
    <>
      {header}{tabs}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendite" value={cnt()} />
        <StatTile label="Incasso" value={money(tot())} tone="accent" />
        <StatTile label="Dalla stalla" value={money(tot("STALLA"))} hint={`${cnt("STALLA")} vendite`} />
        <StatTile label="Al blip" value={money(tot("GOVERNO"))} hint={`${cnt("GOVERNO")} vendite`} />
      </div>
      {filters}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-fg-3">Visualizza:</span>
        <Link className="chip" aria-pressed={sp.vista !== "stallieri"} href={`/vendite?${keep({ vista: "" })}`}>Tabella</Link>
        <Link className="chip" aria-pressed={sp.vista === "stallieri"} href={`/vendite?${keep({ vista: "stallieri" })}`}>Per stalliere</Link>
      </div>
      {sp.vista === "stallieri" ? (
        sales.length === 0 ? <Card><Empty>Nessuna vendita trovata.</Empty></Card> : (
          <div className="space-y-7">
            {[...new Map(sales.map((x) => [x.sellerId, x.sellerName])).entries()].map(([sid, name]) => {
              const mine = sales.filter((x) => x.sellerId === sid);
              const total = mine.filter((x) => !x.voided).reduce((t, x) => t + Number(x.finalPrice), 0);
              return (
                <section key={sid}>
                  <h2 className="mb-3 flex flex-wrap items-baseline gap-2">
                    <span className="h-display text-[20px]">{name}</span>
                    <span className="text-[13px] text-fg-3">{mine.length} vendite · {money(total)}</span>
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {mine.map((x) => (
                      <Link key={x.id} href={`/stalla/${x.horseId}`} className={clsx("card flex gap-3 p-3 transition-colors hover:border-border-strong", x.voided && "opacity-50")}>
                        <HorseThumb src={imageUrl(x.horse.coat.imagePath)} size={56} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><div className="truncate font-semibold">{x.breedName}</div><div className="truncate text-[13px] text-fg-3">{x.coatName}</div></div>
                            <b className="text-[15.5px] whitespace-nowrap">{money(x.finalPrice)}</b>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-3">
                            <SaleTypeBadge type={x.type} />
                            {x.plate && <span className="font-mono">{x.plate}</span>}
                            <span>{dateTime(x.soldAt)}</span>
                            {x.voided && <span className="badge badge-accent">Annullata</span>}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
      <Card pad={false}>
        {sales.length === 0 ? <Empty>Nessuna vendita trovata.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th className="!pl-5">Cavallo</th><th>Tipo</th><th>Targa</th><th>Età</th><th>Venditore</th><th>Data</th><th className="num">Listino</th><th className="num">Prezzo</th>{isAdmin && <th className="!pr-5" />}</tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className={clsx(String(s.id) === sp.evidenzia && "[&>td]:!bg-accent-soft", s.voided && "opacity-50")}>
                    <td className="!pl-5">
                      <HorseName image={imageUrl(s.horse.coat.imagePath)} breed={s.breedName} coat={s.coatName} href={`/stalla/${s.horseId}`} sub={s.buyerName ? `a ${s.buyerName}` : undefined} />
                      {s.voided && <div className="mt-1 text-[12.5px] text-accent-text">Annullata: {s.voidReason}</div>}
                    </td>
                    <td><SaleTypeBadge type={s.type} /></td>
                    <td className="font-mono">{s.plate ?? "—"}</td>
                    <td className="whitespace-nowrap">{s.ageAtSale != null ? formatAge(Number(s.ageAtSale)) : "—"}</td>
                    <td>{s.sellerName}</td>
                    <td className="whitespace-nowrap text-fg-2">{dateTime(s.soldAt)}</td>
                    <td className="num text-fg-2">{money(s.listPrice)}{s.discountValue ? <div className="text-[12px]">sconto {s.discountType === "PERCENTUALE" ? `${Number(s.discountValue)}%` : money(s.discountValue)}</div> : null}</td>
                    <td className="num text-[15.5px] font-bold">{money(s.finalPrice)}</td>
                    {isAdmin && (
                      <td className="!pr-5 text-right">
                        <SaleAdmin sale={{ id: s.id, finalPrice: Number(s.finalPrice), sellerId: s.sellerId, buyerName: s.buyerName, notes: s.notes, soldAt: s.soldAt.toISOString(), voided: s.voided, type: s.type }} sellers={sellers} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {count > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-fg-3">Pagina {page} di {Math.ceil(count / PAGE)}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn btn-secondary btn-sm" href={`/vendite?${keep({ pagina: String(page - 1) })}`}>← Precedenti</Link>}
              {page * PAGE < count && <Link className="btn btn-secondary btn-sm" href={`/vendite?${keep({ pagina: String(page + 1) })}`}>Successive →</Link>}
            </div>
          </div>
        )}
      </Card>
      )}
    </>
  );
}
