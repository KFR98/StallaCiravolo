import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";
import { PageHeader, Panel, TableWrap } from "@/components/ui";
import clsx from "clsx";

export const metadata = { title: "Listino prezzi" };

const TABS = [
  { key: "vendita", label: "Prezzi di vendita" },
  { key: "governo", label: "Prezzi Governo" },
  { key: "acquisto", label: "Prezzi di acquisto" },
] as const;

export default async function PriceListPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requireUser("prices.view");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "vendita";
  const s = await getSettings();
  const breeds = await prisma.breed.findMany({
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      coats: {
        where: { archived: false, ...(sp.q ? { OR: [{ name: { contains: sp.q } }, { breed: { name: { contains: sp.q } } }] } : {}) },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });
  const rows = breeds.filter((b) => b.coats.length);
  return (
    <>
      <PageHeader
        title="Listino ufficiale"
        subtitle="Prezzi ufficiali della stalla. Il prezzo di vendita dipende dall'età del cavallo; oltre la fascia massima lo decide lo stalliere."
        actions={
          <>
            {can(user.role, "catalog.manage") && <Link href="/admin/catalogo" className="btn btn-gold">Modifica prezzi</Link>}
            {can(user.role, "data.export") && <a href="/api/export/listino" className="btn btn-ghost !bg-paper/80">Esporta Excel</a>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/listino?tab=${t.key}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={clsx("btn", tab === t.key ? "btn-gold" : "btn-ghost !bg-paper/70")}>{t.label}</Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={sp.q} className="input !w-56" placeholder="Cerca…" />
        </form>
      </div>
      <Panel>
        <p className="mb-3 text-[15px] text-ink-soft italic">
          {tab === "vendita" && `Quanto chiede la stalla al cliente (colonne "TOT"). Sotto i ${s.minSaleAge} anni il cavallo non è vendibile; oltre i ${s.bracketBMax} anni il prezzo è libero.`}
          {tab === "governo" && "Quanto paga il Governo al blip per un cavallo catturato e venduto subito (senza passare dalla stalla)."}
          {tab === "acquisto" && "Prezzo di acquisto al blip del Governo (Listino Gov) e dettaglio dei costi base. Informativo per lo stalliere."}
        </p>
        <TableWrap>
          <table className="ledger">
            <thead>
              <tr>
                <th>Razza</th><th>Manto</th>
                {tab === "vendita" && <><th className="num">{s.minSaleAge}-{s.bracketAMax} anni</th><th className="num">{s.bracketAMax + 1}-{s.bracketBMax} anni</th><th className="num">Oltre {s.bracketBMax}</th></>}
                {tab === "governo" && <th className="num">Vendita al Governo</th>}
                {tab === "acquisto" && <><th className="num">Listino Gov</th><th className="num">Base 5-10</th><th className="num">Base 11-15</th><th className="num">Addestr.</th></>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) =>
                b.coats.map((c, i) => (
                  <tr key={c.id} className={clsx(i === 0 && "[&>td]:border-t-2 [&>td]:border-t-leather/30")}>
                    <td className="title-fell text-leather">{i === 0 ? b.name : ""}</td>
                    <td><Link href={`/catalogo/${c.id}`} className="hover:underline">{c.name}</Link></td>
                    {tab === "vendita" && <><td className="num font-semibold">{money(c.salePriceA)}</td><td className="num font-semibold">{money(c.salePriceB)}</td><td className="num italic text-ink-soft">libero</td></>}
                    {tab === "governo" && <td className="num font-semibold text-blood">{money(c.governmentPrice)}</td>}
                    {tab === "acquisto" && <><td className="num font-semibold">{money(c.govListPrice)}</td><td className="num">{money(c.basePriceA)}</td><td className="num">{money(c.basePriceB)}</td><td className="num">{money(c.trainingPrice)}</td></>}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </>
  );
}
