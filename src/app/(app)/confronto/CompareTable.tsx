"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import clsx from "clsx";

export type CompareRow = {
  id: number; breed: string; coat: string; image: string | null;
  salePriceA: number | null; salePriceB: number | null; governmentPrice: number | null; govListPrice: number | null; statTotal: number;
};

type PriceKey = "salePriceA" | "salePriceB" | "governmentPrice" | "govListPrice";
type SortKey = "price_asc" | "price_desc" | "breed" | "coat" | "stats";

export function CompareTable({ rows, labels, maxTotal }: { rows: CompareRow[]; labels: { a: string; b: string }; maxTotal: number }) {
  const [breedQ, setBreedQ] = useState("");
  const [coatQ, setCoatQ] = useState("");
  const [priceKey, setPriceKey] = useState<PriceKey>("salePriceA");
  const [sort, setSort] = useState<SortKey>("price_asc");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  const view = useMemo(() => {
    const bq = breedQ.trim().toLowerCase();
    const cq = coatQ.trim().toLowerCase();
    const lo = min === "" ? -Infinity : Number(min);
    const hi = max === "" ? Infinity : Number(max);
    const out = rows.filter((r) => {
      if (bq && !r.breed.toLowerCase().includes(bq)) return false;
      if (cq && !r.coat.toLowerCase().includes(cq)) return false;
      const p = r[priceKey];
      if ((min !== "" || max !== "") && (p == null || p < lo || p > hi)) return false;
      return true;
    });
    const pv = (r: CompareRow) => r[priceKey] ?? Infinity;
    out.sort((a, b) => {
      switch (sort) {
        case "price_asc": return pv(a) - pv(b) || a.breed.localeCompare(b.breed);
        case "price_desc": return (b[priceKey] ?? -Infinity) - (a[priceKey] ?? -Infinity) || a.breed.localeCompare(b.breed);
        case "breed": return a.breed.localeCompare(b.breed) || a.coat.localeCompare(b.coat);
        case "coat": return a.coat.localeCompare(b.coat) || a.breed.localeCompare(b.breed);
        case "stats": return b.statTotal - a.statTotal;
      }
    });
    return out;
  }, [rows, breedQ, coatQ, priceKey, sort, min, max]);

  const PRICE_LABEL: Record<PriceKey, string> = { salePriceA: `Vendita ${labels.a}`, salePriceB: `Vendita ${labels.b}`, governmentPrice: "Governo", govListPrice: "Listino Gov" };
  const bands = [[0, 100], [100, 300], [300, 600], [600, 1000], [1000, 2000]];

  return (
    <>
      <div className="panel panel-pad mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className="input" placeholder="Cerca razza" value={breedQ} onChange={(e) => setBreedQ(e.target.value)} />
        <input className="input" placeholder="Cerca manto" value={coatQ} onChange={(e) => setCoatQ(e.target.value)} />
        <select className="input" value={priceKey} onChange={(e) => setPriceKey(e.target.value as PriceKey)}>
          {Object.entries(PRICE_LABEL).map(([k, v]) => <option key={k} value={k}>Prezzo: {v}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="price_asc">Dal più economico</option>
          <option value="price_desc">Dal più costoso</option>
          <option value="breed">Alfabetico per razza</option>
          <option value="coat">Alfabetico per manto</option>
          <option value="stats">Statistiche migliori</option>
        </select>
        <div className="flex gap-2">
          <input className="input" type="number" placeholder="Min $" value={min} onChange={(e) => setMin(e.target.value)} />
          <input className="input" type="number" placeholder="Max $" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
          <span className="label">Fasce rapide:</span>
          {bands.map(([a, b]) => (
            <button key={a} type="button" onClick={() => { setMin(String(a)); setMax(String(b)); }} className={clsx("btn btn-sm", min === String(a) && max === String(b) ? "btn-gold" : "btn-ghost")}>
              ${a}–{b}
            </button>
          ))}
          <button type="button" onClick={() => { setMin("1000"); setMax(""); }} className="btn btn-sm btn-ghost">oltre $1000</button>
          <button type="button" onClick={() => { setMin(""); setMax(""); setBreedQ(""); setCoatQ(""); }} className="btn btn-sm btn-ghost">Azzera</button>
          <span className="ml-auto text-ink-soft italic">{view.length} risultati</span>
        </div>
      </div>
      <div className="panel panel-pad">
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className="ledger">
            <thead>
              <tr>
                <th></th><th>Razza</th><th>Manto</th>
                <th className={clsx("num", priceKey === "salePriceA" && "!text-blood")}>{labels.a}</th>
                <th className={clsx("num", priceKey === "salePriceB" && "!text-blood")}>{labels.b}</th>
                <th className={clsx("num", priceKey === "governmentPrice" && "!text-blood")}>Governo</th>
                <th className={clsx("num", priceKey === "govListPrice" && "!text-blood")}>Listino Gov</th>
                <th className="num">Stat.</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id}>
                  <td className="w-14">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" className="h-9 w-12 rounded-[2px] object-cover" loading="lazy" />
                    ) : <div className="h-9 w-12 bg-[#cdb180]/50" />}
                  </td>
                  <td className="title-fell text-leather">{r.breed}</td>
                  <td><Link href={`/catalogo/${r.id}`} className="hover:underline">{r.coat}</Link></td>
                  <td className={clsx("num", priceKey === "salePriceA" && "font-bold")}>{money(r.salePriceA)}</td>
                  <td className={clsx("num", priceKey === "salePriceB" && "font-bold")}>{money(r.salePriceB)}</td>
                  <td className={clsx("num text-blood", priceKey === "governmentPrice" && "font-bold")}>{money(r.governmentPrice)}</td>
                  <td className={clsx("num", priceKey === "govListPrice" && "font-bold")}>{money(r.govListPrice)}</td>
                  <td className="num">
                    <div className="ml-auto flex w-24 items-center gap-2">
                      <div className="statbar !h-[7px]"><span style={{ width: `${maxTotal ? (r.statTotal / maxTotal) * 100 : 0}%` }} /></div>
                      <span className="text-[13px]">{r.statTotal}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
