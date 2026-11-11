"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import clsx from "clsx";
import { HorseThumb } from "@/components/ui";
import { Rating } from "@/components/StatBars";
import { matchHorse } from "@/components/HorsePicker";
import { money } from "@/lib/format";
import type { CatalogRow, CatalogMeta } from "@/lib/catalog";

type SortKey = "score" | "value" | "price" | "breed" | `stat${number}`;

export function CompareTable({ rows, meta, labels }: { rows: CatalogRow[]; meta: CatalogMeta; labels: { a: string; b: string } }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  // Qualità/prezzo: voto per ogni $1000 del prezzo 5-10, normalizzato a 100 sul migliore
  const withValue = useMemo(() => {
    const raw = rows.map((r) => (r.score != null && r.salePriceA ? r.score / r.salePriceA : null));
    const best = Math.max(...raw.filter((x): x is number => x != null), 0);
    return rows.map((r, i) => ({ ...r, value: raw[i] != null && best ? Math.round((raw[i]! / best) * 100) : null }));
  }, [rows]);

  const list = useMemo(() => {
    const lo = min === "" ? -Infinity : Number(min);
    const hi = max === "" ? Infinity : Number(max);
    const out = withValue.filter((r) => matchHorse(r, q) && (min === "" && max === "" ? true : r.salePriceA != null && r.salePriceA >= lo && r.salePriceA <= hi));
    const val = (r: (typeof out)[number]): number | string | null =>
      sort === "score" ? r.score : sort === "value" ? r.value : sort === "price" ? r.salePriceA : sort === "breed" ? `${r.breed} ${r.coat}` : r.stats[Number(sort.slice(4))];
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * dir;
    });
  }, [withValue, q, min, max, sort, dir]);

  const head = (key: SortKey, label: string, cls = "num") => (
    <th className={cls}>
      <button className={clsx("inline-flex items-center gap-1 uppercase", sort === key && "text-fg")} onClick={() => (sort === key ? setDir((d) => (d === 1 ? -1 : 1)) : (setSort(key), setDir(key === "breed" || key === "price" ? 1 : -1)))}>
        {label}<ArrowUpDown size={12} aria-hidden="true" />
      </button>
    </th>
  );

  const best = [...withValue].filter((r) => r.score != null).sort((a, b) => b.score! - a.score!).slice(0, 3);
  const deals = [...withValue].filter((r) => r.value != null).sort((a, b) => b.value! - a.value!).slice(0, 3);

  return (
    <>
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {[["I migliori", best, (r: (typeof best)[number]) => <Rating score={r.score} />], ["Miglior qualità/prezzo", deals, (r: (typeof best)[number]) => <span className="badge badge-ok">Q/P {r.value}</span>]].map(([title, items, badge]) => (
          <div key={title as string} className="card card-pad">
            <h3 className="eyebrow mb-2">{title as string}</h3>
            <ul className="space-y-2">
              {(items as typeof best).map((r) => (
                <li key={r.id} className="flex items-center gap-2.5">
                  <HorseThumb src={r.image} size={32} />
                  <Link href={`/catalogo/${r.id}`} className="min-w-0 flex-1 truncate hover:text-accent-text"><b>{r.breed}</b> <span className="text-fg-3">· {r.coat}</span></Link>
                  {(badge as (r: (typeof best)[number]) => React.ReactNode)(r)}
                  <b className="w-16 text-right tabular-nums">{money(r.salePriceA)}</b>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca razza o manto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
        </div>
        <input className="input !w-28" type="number" placeholder="Min $" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Prezzo minimo" />
        <input className="input !w-28" type="number" placeholder="Max $" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Prezzo massimo" />
        <span className="text-[13px] text-fg-3">{list.length} cavalli · clicca le intestazioni per ordinare</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl tbl-compact">
          <thead>
            <tr>
              {head("breed", "Cavallo", "sticky left-0 z-10 bg-surface !pl-4")}
              {head("score", "Voto")}
              {meta.map((m, i) => head(`stat${i}`, m.label))}
              {head("price", labels.a)}
              <th className="num">{labels.b}</th>
              <th className="num">Blip</th>
              {head("value", "Q/P", "num !pr-4")}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 bg-surface !pl-4">
                  <Link href={`/catalogo/${r.id}`} className="flex min-w-[180px] items-center gap-2.5 hover:text-accent-text">
                    <HorseThumb src={r.image} size={32} />
                    <span className="min-w-0"><b className="block truncate">{r.breed}</b><span className="block truncate text-[13px] text-fg-3">{r.coat}</span></span>
                  </Link>
                </td>
                <td className="num"><Rating score={r.score} /></td>
                {r.stats.map((v, i) => (
                  <td key={i} className="num">
                    <div className="ml-auto flex w-[64px] items-center gap-1.5" title={`${meta[i].label}: ${v ?? "—"} su ${meta[i].max}`}>
                      <div className="statbar !h-1.5"><span style={{ width: `${v != null && meta[i].max ? (v / meta[i].max) * 100 : 0}%` }} /></div>
                      <span className="w-6 text-right text-[13px] tabular-nums">{v ?? "—"}</span>
                    </div>
                  </td>
                ))}
                <td className="num font-semibold">{money(r.salePriceA)}</td>
                <td className="num">{money(r.salePriceB)}</td>
                <td className="num text-fg-2">{money(r.governmentPrice)}</td>
                <td className="num !pr-4">{r.value != null ? <span className={clsx("badge", r.value >= 80 ? "badge-ok" : "badge-neutral")}>{r.value}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] text-fg-3">Voto = media delle statistiche rispetto al miglior cavallo (0-10). Q/P = voto in rapporto al prezzo {labels.a}: 100 è il miglior affare del catalogo.</p>
    </>
  );
}
