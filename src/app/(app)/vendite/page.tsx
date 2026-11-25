import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { imageUrl } from "@/lib/catalog";
import { money, dateTime, TZ } from "@/lib/format";
import { salesFeed, sortFeed, feedTotals, SORTS, type FeedEntry } from "@/lib/sales-feed";
import { PageHeader, Card, Empty, StatTile, HorseThumb } from "@/components/ui";
import { SaleTag, type SaleKind } from "@/components/SaleTag";
import { SaleAdmin, ItemSaleAdmin } from "./SaleAdmin";

export const metadata = { title: "Vendite" };

type SP = { vista?: string; venditore?: string; da?: string; a?: string; q?: string; tipo?: string; ordina?: string; min?: string; max?: string; annullate?: string; evidenzia?: string; pagina?: string };
const PAGE = 100;
const KINDS: [SaleKind, string][] = [["cavallo", "Cavalli"], ["addestramento", "Addestramenti"], ["vetrina", "Vetrina"], ["blip", "Blip"]];
const COUNT_LABEL: Record<SaleKind, string> = { cavallo: "cavalli venduti", addestramento: "addestramenti", vetrina: "fatture con oggetti", blip: "vendite al blip" };

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
  const sellers = all ? await prisma.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : [];
  // senza "vedere le vendite di tutti" si vedono solo le proprie (controllo lato server)
  const sellerId = !all ? user.id : sp.venditore ? Number(sp.venditore) || -1 : undefined;
  const keep = (extra: Record<string, string>) =>
    new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["pagina", "evidenzia"].includes(k))), ...extra }).toString();

  const feed = await salesFeed({ sellerId, soldAt: dateRange(sp), q: sp.q, includeVoided: sp.annullate === "1" }, imageUrl);
  const tipo = KINDS.some(([k]) => k === sp.tipo) ? (sp.tipo as SaleKind) : null;
  const min = sp.min && Number.isFinite(Number(sp.min)) ? Number(sp.min) : null;
  const max = sp.max && Number.isFinite(Number(sp.max)) ? Number(sp.max) : null;
  const filtered = feed.filter((e) => (!tipo || e.tags.includes(tipo)) && (min == null || e.total >= min) && (max == null || e.total <= max));
  const sort = SORTS.some(([k]) => k === sp.ordina) ? sp.ordina! : "recenti";
  const list = sortFeed(filtered, sort);
  const tot = feedTotals(filtered);
  const page = Math.max(1, Number(sp.pagina) || 1);
  const pageRows = list.slice((page - 1) * PAGE, page * PAGE);
  const byStalliere = sp.vista === "stallieri";

  const header = (
    <PageHeader
      title={all ? "Vendite" : "Le mie vendite"}
      subtitle="Cavalli, addestramenti e oggetti della vetrina: tutto in un unico elenco. Le vendite non si cancellano, si correggono o si annullano."
      actions={can(user.role, "data.export") ? <a href={`/api/export/vendite?${keep({})}`} className="btn btn-secondary">Esporta Excel</a> : undefined}
    />
  );

  return (
    <>
      {header}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Incasso" value={money(tot.total)} hint={`${tot.count} fatture`} tone="accent" />
        {KINDS.map(([k]) => (
          <Link key={k} href={`/vendite?${keep({ tipo: tipo === k ? "" : k })}`} className={clsx("card block p-3.5 transition-colors hover:border-border-strong", tipo === k && "ring-2 ring-accent")}>
            <SaleTag kind={k} />
            <div className="mt-1.5 text-[22px] font-bold tabular-nums">{money(tot[k])}</div>
            <div className="text-[12.5px] text-fg-3">{tot.n[k]} {COUNT_LABEL[k]}</div>
          </Link>
        ))}
      </div>

      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr]">
        <input name="q" defaultValue={sp.q} className="input" placeholder="Cerca razza, manto, targa, oggetto, acquirente…" aria-label="Cerca" />
        {all ? (
          <select name="venditore" defaultValue={sp.venditore ?? ""} className="input" aria-label="Stalliere">
            <option value="">Tutti gli stallieri</option>
            {sellers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </select>
        ) : <div className="hidden lg:block" />}
        <input type="date" name="da" defaultValue={sp.da} className="input" aria-label="Dal" title="Dal" />
        <input type="date" name="a" defaultValue={sp.a} className="input" aria-label="Al" title="Al" />
        <select name="ordina" defaultValue={sort} className="input" aria-label="Ordina">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
          <select name="tipo" defaultValue={tipo ?? ""} className="input !min-h-9 !w-auto !py-1" aria-label="Tipo">
            <option value="">Tutti i tipi</option>
            {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input name="min" type="number" defaultValue={sp.min} className="input !min-h-9 !w-28 !py-1" placeholder="Importo min" aria-label="Importo minimo" />
          <input name="max" type="number" defaultValue={sp.max} className="input !min-h-9 !w-28 !py-1" placeholder="Importo max" aria-label="Importo massimo" />
          {all && (
            <label className="flex items-center gap-2 text-[14px] text-fg-2"><input type="checkbox" name="vista" value="stallieri" defaultChecked={byStalliere} />Raggruppa per stalliere</label>
          )}
          <label className="flex items-center gap-2 text-[14px] text-fg-2"><input type="checkbox" name="annullate" value="1" defaultChecked={sp.annullate === "1"} />Mostra annullate</label>
          <span className="flex-1" />
          <button className="btn btn-primary">Filtra</button>
          <Link href="/vendite" className="btn btn-ghost">Azzera</Link>
        </div>
      </form>

      {list.length === 0 ? <Card><Empty>Nessuna vendita trovata.</Empty></Card> : byStalliere ? (
        <div className="space-y-6">
          {[...new Map(list.map((x) => [x.sellerId, x.sellerName])).entries()]
            .sort((a, b) => a[1].localeCompare(b[1], "it"))
            .map(([sid, name]) => {
              const mine = list.filter((x) => x.sellerId === sid);
              const t = feedTotals(mine);
              return (
                <Card key={sid} pad={false} title={
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {name}
                    <span className="font-sans text-[13.5px] font-normal tracking-normal text-fg-3 normal-case">
                      {t.count} fatture · <b className="text-fg">{money(t.total)}</b>
                      {KINDS.filter(([k]) => t[k] > 0).map(([k, l]) => ` · ${l.toLowerCase()} ${money(t[k])}`).join("")}
                    </span>
                  </span>
                }>
                  <SalesTable rows={mine.slice(0, 200)} sp={sp} isAdmin={isAdmin} sellers={sellers} />
                </Card>
              );
            })}
        </div>
      ) : (
        <Card pad={false}>
          <div className="border-b border-border px-4 py-2.5 text-[13.5px] text-fg-3 sm:px-5">
            {list.length} {list.length === 1 ? "fattura" : "fatture"} · ordinate per {SORTS.find(([k]) => k === sort)?.[1].toLowerCase()}
          </div>
          <SalesTable rows={pageRows} sp={sp} isAdmin={isAdmin} sellers={sellers} />
          {list.length > PAGE && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-fg-3">Pagina {page} di {Math.ceil(list.length / PAGE)}</span>
              <div className="flex gap-2">
                {page > 1 && <Link className="btn btn-secondary btn-sm" href={`/vendite?${keep({ pagina: String(page - 1) })}`}>← Precedenti</Link>}
                {page * PAGE < list.length && <Link className="btn btn-secondary btn-sm" href={`/vendite?${keep({ pagina: String(page + 1) })}`}>Successive →</Link>}
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function SalesTable({ rows, sp, isAdmin, sellers }: { rows: FeedEntry[]; sp: SP; isAdmin: boolean; sellers: { id: number; displayName: string }[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((e) => (
        <li key={e.key} className={clsx("flex gap-3 px-4 py-3 sm:px-5", e.voided && "opacity-55", e.source === "sale" && String(e.id) === sp.evidenzia && "bg-accent-soft")}>
          {e.horseId ? (
            <Link href={`/stalla/${e.horseId}`} className="shrink-0"><HorseThumb src={e.image} size={48} /></Link>
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-3 text-[20px]" aria-hidden="true">{e.tags.includes("addestramento") ? "🏇" : "🛒"}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {e.tags.map((t) => <SaleTag key={t} kind={t} />)}
              {e.voided && <span className="badge badge-accent">Annullata</span>}
            </div>
            <div className={clsx("mt-1 font-semibold break-words", e.voided && "line-through")}>
              {e.horseId ? <Link href={`/stalla/${e.horseId}`} className="hover:underline">{e.title}</Link> : e.title}
            </div>
            <div className="text-[13px] text-fg-3">
              {[e.subtitle, e.plate && `Targa ${e.plate}`, `venduto da ${e.sellerName}`, e.buyerName && `a ${e.buyerName}`, dateTime(e.soldAt)].filter(Boolean).join(" · ")}
            </div>
            {e.voided && e.voidReason && <div className="text-[12.5px] text-accent-text">Annullata: {e.voidReason}</div>}
            {e.lines.length > 1 && (
              <details className="mt-1 text-[13px]">
                <summary className="cursor-pointer text-fg-2 hover:text-fg">Dettaglio fattura ({e.lines.length} righe)</summary>
                <ul className="mt-1 space-y-0.5">
                  {e.lines.map((l, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <SaleTag kind={l.kind} short />
                      <span className="min-w-0 flex-1 truncate">{l.qty > 1 ? `${l.qty}× ` : ""}{l.label}</span>
                      <span className="tabular-nums">{money(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <b className="text-[16px] tabular-nums">{money(e.total)}</b>
            {e.listTotal != null && e.listTotal !== e.total && <span className="text-[12px] text-fg-3 line-through">{money(e.listTotal)}</span>}
            {isAdmin && !e.voided && (e.source === "sale" ? (
              <SaleAdmin sale={{ id: e.id, finalPrice: e.lines[0]?.amount ?? e.total, sellerId: e.sellerId, buyerName: e.buyerName, notes: e.notes, soldAt: e.soldAt.toISOString(), voided: e.voided, type: e.saleType ?? "STALLA" }} sellers={sellers} />
            ) : <ItemSaleAdmin id={e.id} />)}
          </div>
        </li>
      ))}
    </ul>
  );
}
