import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { imageUrl } from "@/lib/catalog";
import { money } from "@/lib/format";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card, TableWrap } from "@/components/ui";
import { BreedButton, StatsEditor } from "./CatalogForms";
import { getStatMeta } from "@/lib/catalog";

export const metadata = { title: "Gestione catalogo" };

export default async function AdminCatalog({ searchParams }: { searchParams: Promise<{ razza?: string; q?: string; filtro?: string }> }) {
  const me = await requireUser("catalog.manage");
  const sp = await searchParams;
  const [meta, statCounts, coatTotal] = await Promise.all([
    getStatMeta(),
    prisma.coatStat.groupBy({ by: ["statId"], where: { value: { not: null } }, _count: true }),
    prisma.coat.count({ where: { archived: false } }),
  ]);
  const [breeds, stats] = await Promise.all([
    prisma.breed.findMany({
      orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        coats: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { horses: true } }, stats: true } },
        _count: { select: { horses: true } },
      },
    }),
    prisma.statDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const q = sp.q?.toLowerCase();
  const shown = breeds
    .filter((b) => !sp.razza || b.id === Number(sp.razza))
    .map((b) => ({
      ...b,
      coats: b.coats.filter(
        (c) =>
          (!q || c.name.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)) &&
          (sp.filtro !== "senza-immagine" || !c.imagePath) &&
          (sp.filtro !== "dati-mancanti" || c.salePriceA == null || c.salePriceB == null || c.governmentPrice == null || c.stats.length < stats.length || c.stats.some((s) => s.value == null)),
      ),
    }))
    .filter((b) => b.coats.length || (!q && !sp.filtro));

  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Razze, manti, immagini, statistiche e prezzi." actions={<BreedButton label="+ Nuova razza" className="btn btn-primary" />} />
      <AdminTabs role={me.role} active="catalogo" />
      <div className="mb-5">
        <Card>
          <form className="grid gap-3 sm:grid-cols-[1.5fr_1.5fr_1.5fr_auto]">
            <input name="q" defaultValue={sp.q} className="input" placeholder="Cerca razza o manto…" />
            <select name="razza" defaultValue={sp.razza ?? ""} className="input"><option value="">Tutte le razze</option>{breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <select name="filtro" defaultValue={sp.filtro ?? ""} className="input">
              <option value="">Tutti i manti</option>
              <option value="senza-immagine">Senza immagine</option>
              <option value="dati-mancanti">Con dati mancanti</option>
            </select>
            <button className="btn btn-primary">Filtra</button>
          </form>
        </Card>

      </div>
      <div className="space-y-5">
        {shown.map((b) => (
          <Card
            key={b.id}
            title={<>{b.name}{b.isCustom && <span className="badge badge-neutral ml-2 align-middle">mod</span>}{b.archived && <span className="badge badge-accent ml-2 align-middle">archiviata</span>}</>}
            actions={
              <>
                <Link href={`/admin/catalogo/manto/nuovo?razza=${b.id}`} className="btn btn-primary btn-sm">+ Manto</Link>
                <BreedButton label="Modifica razza" breed={{ id: b.id, name: b.name, description: b.description, isCustom: b.isCustom, sortOrder: b.sortOrder, archived: b.archived, horses: b._count.horses }} />
              </>
            }
          >
            <TableWrap>
              <table className="tbl">
                <thead><tr><th></th><th>Manto</th><th className="num">Vend. A</th><th className="num">Vend. B</th><th className="num">Governo</th><th className="num">Listino Gov</th><th className="num">Stat.</th><th className="num">Cavalli</th><th /></tr></thead>
                <tbody>
                  {b.coats.map((c) => (
                    <tr key={c.id} className={c.archived ? "opacity-50" : ""}>
                      <td className="w-14">
                        {c.imagePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl(c.imagePath)!} alt="" className="h-9 w-12 rounded-[2px] object-cover" loading="lazy" />
                        ) : <span className="badge badge-accent !text-[10px]">no foto</span>}
                      </td>
                      <td>{c.name}{c.archived && <span className="ml-1 text-[13px]">(archiviato)</span>}{c.originalName && c.originalName !== c.name && <div className="text-[12.5px] text-fg-3">Excel: {c.originalName}</div>}</td>
                      <td className="num">{money(c.salePriceA)}</td>
                      <td className="num">{money(c.salePriceB)}</td>
                      <td className="num">{money(c.governmentPrice)}</td>
                      <td className="num">{money(c.govListPrice)}</td>
                      <td className="num">{c.stats.filter((s) => s.value != null).length}/{stats.length}</td>
                      <td className="num">{c._count.horses}</td>
                      <td className="text-right"><Link href={`/admin/catalogo/manto/${c.id}`} className="btn btn-primary btn-sm">Modifica</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        ))}
      </div>
      <details id="statistiche" className="card mt-6">
        <summary className="card-pad cursor-pointer">
          <span className="h-display text-[18px]">Statistiche dei cavalli</span>
          <span className="ml-2 text-[13.5px] text-fg-3">nomi, ordine e valori massimi</span>
        </summary>
        <div className="card-pad !pt-0">
          <StatsEditor stats={meta.map((m) => ({ id: m.id, label: m.label, max: m.max, filled: statCounts.find((c) => c.statId === m.id)?._count ?? 0, total: coatTotal }))} />
        </div>
      </details>
    </>
  );
}
