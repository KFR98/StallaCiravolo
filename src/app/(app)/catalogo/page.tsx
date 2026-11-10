import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStatMeta, statRows, imageUrl } from "@/lib/catalog";
import { money } from "@/lib/format";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { StatBars } from "@/components/StatBars";

export const metadata = { title: "Catalogo cavalli" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; razza?: string; mod?: string }> }) {
  const user = await requireUser("catalog.view");
  const sp = await searchParams;
  const s = await getSettings();
  const meta = await getStatMeta();
  const coatWhere: Prisma.CoatWhereInput = { archived: false };
  if (sp.q) coatWhere.OR = [{ name: { contains: sp.q } }, { breed: { name: { contains: sp.q } } }];
  const breedWhere: Prisma.BreedWhereInput = { archived: false, coats: { some: coatWhere } };
  if (sp.razza) breedWhere.id = Number(sp.razza);
  if (sp.mod === "1") breedWhere.isCustom = true;
  const [breeds, allBreeds] = await Promise.all([
    prisma.breed.findMany({
      where: breedWhere,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { coats: { where: coatWhere, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { stats: true } } },
    }),
    prisma.breed.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const totalCoats = breeds.reduce((n, b) => n + b.coats.length, 0);
  const admin = can(user.role, "catalog.manage");

  return (
    <>
      <PageHeader
        title="Catalogo cavalli"
        subtitle={`${breeds.length} razze · ${totalCoats} manti. Le barre mostrano ogni statistica rispetto al miglior cavallo del catalogo.`}
        actions={admin ? <Link href="/admin/catalogo" className="btn btn-gold">Gestisci catalogo</Link> : undefined}
      />
      <Panel className="mb-5">
        <form className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto_auto]">
          <input name="q" defaultValue={sp.q} className="input" placeholder="Cerca razza o manto…" />
          <select name="razza" defaultValue={sp.razza ?? ""} className="input">
            <option value="">Tutte le razze</option>
            {allBreeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" name="mod" value="1" defaultChecked={sp.mod === "1"} className="size-4 accent-[#5a3a22]" />Solo razze mod</label>
          <button className="btn btn-primary">Cerca</button>
        </form>
      </Panel>
      {breeds.length === 0 && <Panel><Empty>Nessun cavallo corrisponde alla ricerca.</Empty></Panel>}
      <div className="space-y-6">
        {breeds.map((b) => (
          <section key={b.id} id={`razza-${b.id}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <h2 className="title-western text-[22px] text-gold-bright drop-shadow-[0_2px_0_rgba(0,0,0,.6)]">{b.name}</h2>
              {b.isCustom && <span className="badge badge-gold !bg-paper/80">Razza personalizzata</span>}
              <span className="title-fell text-[14px] text-paper-3/80">{b.coats.length} manti</span>
            </div>
            {b.description && <p className="mb-3 max-w-3xl text-paper-2/90 italic">{b.description}</p>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {b.coats.map((c) => (
                <Link key={c.id} href={`/catalogo/${c.id}`} className="panel group flex flex-col overflow-hidden transition hover:-translate-y-0.5">
                  <div className="relative aspect-[16/10] bg-[#cdb180]/50">
                    {c.imagePath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(c.imagePath)!} alt={`${b.name} ${c.name}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-ink-soft/50"><span className="text-5xl">♞</span><span className="title-fell text-[12px]">Immagine da aggiungere</span></div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pt-6 pb-2">
                      <div className="title-fell text-[18px] text-paper drop-shadow">{c.name}</div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    <StatBars compact stats={statRows(meta, c.stats)} />
                    <div className="mt-auto grid grid-cols-3 gap-1 border-t border-dashed border-[#bfa476] pt-2 text-center text-[13.5px]">
                      <div><div className="label !text-[10.5px]">{s.minSaleAge}-{s.bracketAMax} anni</div><b>{money(c.salePriceA)}</b></div>
                      <div><div className="label !text-[10.5px]">{s.bracketAMax + 1}-{s.bracketBMax} anni</div><b>{money(c.salePriceB)}</b></div>
                      <div><div className="label !text-[10.5px]">Governo</div><b className="text-blood">{money(c.governmentPrice)}</b></div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
