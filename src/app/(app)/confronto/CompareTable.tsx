"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, ArrowUpDown, Plus, Check, X, Star, Trash2, Columns3 } from "lucide-react";
import clsx from "clsx";
import { HorseThumb } from "@/components/ui";
import { Rating } from "@/components/StatBars";
import { matchHorse, HorsePicker, buildHorseOptions } from "@/components/HorsePicker";
import { money } from "@/lib/format";
import type { CatalogRow, CatalogMeta } from "@/lib/catalog";

type SortKey = "score" | "value" | "price" | "breed" | `stat${number}`;
type Row = CatalogRow & { value: number | null };
const KEY = "confronto-cavalli";

export function CompareTable({ rows, meta, labels, maxCompare }: { rows: CatalogRow[]; meta: CatalogMeta; labels: { a: string; b: string }; maxCompare: number }) {
  // cavalli nel comparatore: il browser se li ricorda (se può), così tornando sulla pagina li ritrovi
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setIds(saved.filter((x) => Number.isInteger(x) && rows.some((r) => r.id === x)).slice(0, maxCompare));
    } catch { /* niente memoria nel browser: si parte vuoti */ }
  }, [rows, maxCompare]);
  const save = (next: number[]) => { setIds(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ok */ } };
  const add = (id: number) => { if (!ids.includes(id) && ids.length < maxCompare) save([...ids, id]); };
  const remove = (id: number) => save(ids.filter((x) => x !== id));
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

  return (
    <>
      <ComparePanel rows={withValue} meta={meta} labels={labels} ids={ids} max={maxCompare} onAdd={add} onRemove={remove} onClear={() => save([])} />
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-0 flex-[1_1_200px]">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca razza o manto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
        </div>
        <input className="input !w-28" type="number" placeholder="Min $" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Prezzo minimo" />
        <input className="input !w-28" type="number" placeholder="Max $" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Prezzo massimo" />
        <span className="w-full text-[13px] text-fg-3 sm:w-auto">{list.length} cavalli · clicca le intestazioni per ordinare · <Plus size={12} className="inline" /> per confrontare</span>
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
                <td className="sticky left-0 z-10 bg-surface !pl-2">
                  <span className="flex items-center gap-1.5">
                  <button type="button" onClick={() => (ids.includes(r.id) ? remove(r.id) : add(r.id))} disabled={!ids.includes(r.id) && ids.length >= maxCompare}
                    className={clsx("btn btn-icon btn-sm shrink-0", ids.includes(r.id) ? "btn-primary" : "btn-ghost")}
                    aria-label={ids.includes(r.id) ? `Togli ${r.breed} ${r.coat} dal confronto` : `Aggiungi ${r.breed} ${r.coat} al confronto`}
                    title={ids.includes(r.id) ? "Nel confronto" : ids.length >= maxCompare ? `Massimo ${maxCompare} cavalli` : "Aggiungi al confronto"}>
                    {ids.includes(r.id) ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                  <Link href={`/catalogo/${r.id}`} className="flex min-w-[170px] items-center gap-2.5 hover:text-accent-text">
                    <HorseThumb src={r.image} size={32} />
                    <span className="min-w-0"><b className="block truncate">{r.breed}</b><span className="block truncate text-[13px] text-fg-3">{r.coat}</span></span>
                  </Link>
                  </span>
                </td>
                <td className="num"><Rating score={r.score} /></td>
                {r.stats.map((v, i) => (
                  <td key={i} className="num">
                    <div className="ml-auto flex w-[64px] items-center gap-1.5" title={`${meta[i].label}: ${v ?? "—"} su ${meta[i].max}`}>
                      <div className="statbar !h-1.5"><span style={{ "--pct": `${v != null && meta[i].max ? (v / meta[i].max) * 100 : 0}%` } as React.CSSProperties} /></div>
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

/** Comparatore: i cavalli scelti uno accanto all'altro; in ogni riga il valore migliore è evidenziato. */
function ComparePanel({ rows, meta, labels, ids, max, onAdd, onRemove, onClear }: {
  rows: Row[]; meta: CatalogMeta; labels: { a: string; b: string }; ids: number[]; max: number;
  onAdd: (id: number) => void; onRemove: (id: number) => void; onClear: () => void;
}) {
  const picked = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => !!r);
  const options = useMemo(
    () => buildHorseOptions(
      [...new Map(rows.map((r) => [r.breedId, { id: r.breedId, name: r.breed, coats: [] as { id: number; name: string; image: string | null }[] }])).values()]
        .map((b) => ({ ...b, coats: rows.filter((r) => r.breedId === b.id && !ids.includes(r.id)).map((r) => ({ id: r.id, name: r.coat, image: r.image })) })),
    ),
    [rows, ids],
  );
  const full = picked.length >= max;
  // valore migliore per riga: più alto per voto/statistiche/Q-P, più basso per i prezzi
  const best = (vals: (number | null)[], low = false) => {
    const v = vals.filter((x): x is number => x != null);
    if (v.length < 2) return null;
    const b = low ? Math.min(...v) : Math.max(...v);
    return v.filter((x) => x === b).length === v.length ? null : b;
  };
  const rowsDef: { label: string; get: (r: Row) => number | null; fmt: (v: number | null, r: Row) => React.ReactNode; low?: boolean }[] = [
    { label: "Voto", get: (r) => r.score, fmt: (v, r) => <><b className="sm:hidden">{v ?? "—"}</b><span className="hidden sm:inline-flex"><Rating score={r.score} /></span></> },
    ...meta.map((m, i) => ({
      label: m.label, get: (r: Row) => r.stats[i],
      fmt: (v: number | null) => (
        <span className="inline-flex shrink-0 items-center justify-center gap-2">
          <span className="block w-12 shrink-0 sm:w-20"><span className="statbar block !h-1.5"><span style={{ "--pct": `${v != null && m.max ? (v / m.max) * 100 : 0}%` } as React.CSSProperties} /></span></span>
          <span className="min-w-7 text-right tabular-nums">{v ?? "—"}</span>
        </span>
      ),
    })),
    { label: `Vendita ${labels.a}`, get: (r) => r.salePriceA, fmt: (v) => money(v), low: true },
    { label: `Vendita ${labels.b}`, get: (r) => r.salePriceB, fmt: (v) => money(v), low: true },
    { label: "Addestramento", get: (r) => r.trainingPrice, fmt: (v) => money(v), low: true },
    { label: "Vendita al blip", get: (r) => r.governmentPrice, fmt: (v) => money(v) },
    { label: "Qualità/prezzo", get: (r) => r.value, fmt: (v) => (v != null ? <span className={clsx("badge", v >= 80 ? "badge-ok" : "badge-neutral")}>{v}</span> : "—") },
  ];

  return (
    <section className="card mb-5">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="h-display flex items-center gap-2 text-[18px]"><Columns3 size={18} /> Compara cavalli <span className="font-sans text-[13.5px] font-normal tracking-normal text-fg-3 normal-case">{picked.length}/{max}</span></h2>
        {picked.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}><Trash2 size={15} /> Svuota</button>}
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        {full ? (
          <p className="text-[13.5px] text-fg-3">Hai scelto il massimo di {max} cavalli: togline uno per aggiungerne un altro.</p>
        ) : (
          <HorsePicker key={ids.join(",")} label={picked.length ? "Aggiungi un altro cavallo" : "Scegli i cavalli da confrontare"} options={options} breedName={null} coatName={null}
            placeholder="Scrivi per cercare, es. arabo bianco…" onChange={(o) => { if (o?.coatId) onAdd(o.coatId); }} />
        )}
        {picked.length === 0 ? (
          <p className="text-[14px] text-fg-3">Scegli fino a {max} cavalli qui sopra, o tocca <Plus size={13} className="inline" /> nella lista sotto, per vederli uno accanto all&apos;altro.</p>
        ) : (
          <div className="overflow-x-auto">
            {picked.length > 1 && <p className="mb-2 text-[12.5px] text-fg-3 sm:hidden">Scorri di lato per vedere tutti i cavalli →</p>}
            <table className="w-full min-w-max border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-[92px] bg-surface sm:w-[130px]" />
                  {picked.map((r) => (
                    <th key={r.id} className="min-w-[124px] px-2 pb-3 align-top font-normal sm:min-w-[180px]">
                      <div className="relative flex flex-col items-center gap-1.5 text-center">
                        <button type="button" className="btn btn-ghost btn-icon btn-sm absolute -top-1 -right-1" onClick={() => onRemove(r.id)} aria-label={`Togli ${r.breed} ${r.coat}`}><X size={15} /></button>
                        <span className="sm:hidden"><HorseThumb src={r.image} size={52} /></span>
                        <span className="hidden sm:block"><HorseThumb src={r.image} size={72} /></span>
                        <Link href={`/catalogo/${r.id}`} className="block max-w-[112px] leading-tight break-words whitespace-normal hover:text-accent-text sm:max-w-[170px]"><b className="block">{r.breed}</b><span className="text-[13px] text-fg-3">{r.coat}</span></Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsDef.map((d) => {
                  const b = best(picked.map(d.get), d.low);
                  return (
                    <tr key={d.label}>
                      <th scope="row" className="sticky left-0 z-10 border-t border-border bg-surface py-2 pr-2 text-left text-[12.5px] leading-tight font-semibold text-fg-2 sm:text-[13px]">{d.label}</th>
                      {picked.map((r) => {
                        const v = d.get(r);
                        const win = b != null && v === b;
                        return (
                          <td key={r.id} className={clsx("border-t border-border px-2 py-2 text-center tabular-nums", win && "bg-ok-soft font-bold text-ok")}>
                            <span className="inline-flex w-full items-center justify-center gap-1">{d.fmt(v, r)}{win && <Star size={12} className="shrink-0 fill-current" aria-label="migliore" />}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
