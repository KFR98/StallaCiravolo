"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { HorseThumb } from "@/components/ui";
import { matchHorse } from "@/components/HorsePicker";
import { money } from "@/lib/format";
import type { CatalogRow } from "@/lib/catalog";

type Col = { key: keyof CatalogRow; label: string; hint: string; def: boolean };

export function PriceList({ rows, labels }: { rows: CatalogRow[]; labels: { a: string; b: string } }) {
  const COLS: Col[] = [
    { key: "salePriceA", label: `Vendita ${labels.a} anni`, hint: "Prezzo in stalla (TOT 5-10)", def: true },
    { key: "salePriceB", label: `Vendita ${labels.b} anni`, hint: "Prezzo in stalla (TOT 11-16)", def: true },
    { key: "governmentPrice", label: "Vendita al blip", hint: "Quanto paga il Governo al blip", def: true },
    { key: "govListPrice", label: "Listino Gov", hint: "Prezzo di riferimento del blip (informativo)", def: false },
    { key: "basePriceA", label: `Base ${labels.a}`, hint: "Senza addestramento", def: false },
    { key: "basePriceB", label: "Base 11-15", hint: "Senza addestramento", def: false },
    { key: "trainingPrice", label: "Addestramento", hint: "Costo addestramento", def: false },
  ];
  const [visible, setVisible] = useState<string[]>(COLS.filter((c) => c.def).map((c) => c.key));
  const [q, setQ] = useState("");
  const [breed, setBreed] = useState<number | "">("");
  useEffect(() => {
    try {
      const v = localStorage.getItem("listino-colonne");
      if (v) setVisible(JSON.parse(v));
    } catch {}
  }, []);
  const toggle = (k: string) =>
    setVisible((v) => {
      const next = v.includes(k) ? v.filter((x) => x !== k) : [...v, k];
      try { localStorage.setItem("listino-colonne", JSON.stringify(next)); } catch {}
      return next;
    });
  const breeds = useMemo(() => [...new Map(rows.map((r) => [r.breedId, r.breed])).entries()], [rows]);
  const list = rows.filter((r) => (breed === "" || r.breedId === breed) && matchHorse(r, q));
  const cols = COLS.filter((c) => visible.includes(c.key));

  return (
    <>
      <div className="card mb-4 space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-[2]">
            <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input className="input !pl-9" placeholder="Cerca razza o manto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
          </div>
          <select className="input flex-1" value={breed} onChange={(e) => setBreed(e.target.value ? Number(e.target.value) : "")} aria-label="Razza">
            <option value="">Tutte le razze</option>
            {breeds.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-fg-3">Colonne:</span>
          {COLS.map((c) => <button key={c.key} type="button" className="chip" aria-pressed={visible.includes(c.key)} onClick={() => toggle(c.key)} title={c.hint}>{c.label}</button>)}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="!pl-5">Cavallo</th>{cols.map((c) => <th key={c.key} className="num" title={c.hint}>{c.label}</th>)}</tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td className="!pl-5">
                  <Link href={`/catalogo/${r.id}`} className="flex items-center gap-2.5 hover:text-accent-text">
                    <HorseThumb src={r.image} size={30} />
                    <span><b>{r.breed}</b> <span className="text-fg-3">· {r.coat}</span></span>
                  </Link>
                </td>
                {cols.map((c) => <td key={c.key} className="num font-semibold">{money(r[c.key] as number | null)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
