"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StatBars, Rating } from "@/components/StatBars";
import { HorseGlyph, Empty } from "@/components/ui";
import { matchHorse } from "@/components/HorsePicker";
import { money } from "@/lib/format";
import type { CatalogRow, CatalogMeta } from "@/lib/catalog";

export function CatalogBrowser({ rows, meta, labels }: { rows: CatalogRow[]; meta: CatalogMeta; labels: { a: string; b: string } }) {
  const [q, setQ] = useState("");
  const [breed, setBreed] = useState<number | "">("");
  const breeds = useMemo(() => [...new Map(rows.map((r) => [r.breedId, r.breed])).entries()], [rows]);
  const list = rows.filter((r) => (breed === "" || r.breedId === breed) && matchHorse(r, q));
  const groups = [...new Map(list.map((r) => [r.breedId, r.breed])).entries()];

  return (
    <>
      <div className="card mb-5 flex flex-wrap gap-2 p-3">
        <div className="relative min-w-[220px] flex-[2]">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca razza o manto, es. “arabo grey”…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca nel catalogo" autoFocus />
        </div>
        <select className="input flex-1" value={breed} onChange={(e) => setBreed(e.target.value ? Number(e.target.value) : "")} aria-label="Razza">
          <option value="">Tutte le razze ({breeds.length})</option>
          {breeds.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {list.length === 0 && <div className="card"><Empty>Nessun cavallo trovato.</Empty></div>}
      <div className="space-y-8">
        {groups.map(([bid, name]) => {
          const coats = list.filter((r) => r.breedId === bid);
          return (
            <section key={bid}>
              <h2 className="mb-3 flex items-baseline gap-2">
                <span className="h-display text-[22px]">{name}</span>
                {coats[0].breedCustom && <span className="badge badge-info">Mod</span>}
                <span className="text-[13px] text-fg-3">{coats.length} manti</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {coats.map((c) => (
                  <Link key={c.id} href={`/catalogo/${c.id}`} className="card group flex flex-col overflow-hidden transition-colors hover:border-border-strong">
                    <div className="relative aspect-[16/10] bg-surface-3">
                      {c.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image} alt={`${c.breed} ${c.coat}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      ) : <div className="flex h-full items-center justify-center"><HorseGlyph size={44} /></div>}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><div className="truncate text-[16px] font-semibold">{c.coat}</div><div className="truncate text-[13px] text-fg-3">{c.breed}</div></div>
                        <Rating score={c.score} />
                      </div>
                      <StatBars compact stats={meta.map((m, i) => ({ label: m.label, max: m.max, value: c.stats[i] }))} />
                      <dl className="mt-auto grid grid-cols-3 gap-1 border-t border-border pt-3 text-center text-[13px]">
                        <div><dt className="text-fg-3">{labels.a} anni</dt><dd className="font-semibold">{money(c.salePriceA)}</dd></div>
                        <div><dt className="text-fg-3">{labels.b} anni</dt><dd className="font-semibold">{money(c.salePriceB)}</dd></div>
                        <div><dt className="text-fg-3">Blip</dt><dd className="font-semibold">{money(c.governmentPrice)}</dd></div>
                      </dl>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
