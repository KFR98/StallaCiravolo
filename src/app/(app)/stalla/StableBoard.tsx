"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search, Users, LayoutGrid, ArrowDownUp, SlidersHorizontal, X } from "lucide-react";
import { HorseThumb, Empty } from "@/components/ui";
import { PregnancyBadge } from "@/components/StatusBadge";
import { matchHorse } from "@/components/HorsePicker";
import { RarityBadge, rarityStyle } from "@/components/Rarity";
import { STABLE_SORTS, type StableSort } from "./sorts";

export type BoardHorse = {
  id: number; breed: string; coat: string; image: string | null; plate: string; sex: string; ageText: string; sellable: boolean;
  price: string; ownerId: number; owner: string; capturedBy: string; dueAt: string | null; condition: string | null; mine: boolean;
  rarity: "RARO" | "LEGGENDARIO" | null; needsData: boolean; foal: boolean;
  sexCode: "MASCHIO" | "FEMMINA" | null; age: number; capturedAt: string; tooYoung: boolean; priceValue: number | null; trained: boolean;
};

type Sex = "tutti" | "MASCHIO" | "FEMMINA";
type Rar = "tutte" | "normali" | "RARO" | "LEGGENDARIO";
type Flag = "vendibili" | "addestrati" | "incinte" | "puledri" | "completare" | "giovani";
type Filters = { sex: Sex; rar: Rar; breed: string; flags: Flag[]; ageMin: string; ageMax: string; owner: string };

const EMPTY: Filters = { sex: "tutti", rar: "tutte", breed: "", flags: [], ageMin: "", ageMax: "", owner: "tutti" };
const FLAGS: [Flag, string][] = [["vendibili", "Vendibili"], ["addestrati", "Addestrati"], ["incinte", "Incinte"], ["puledri", "Puledri"], ["completare", "Da completare"], ["giovani", "Troppo giovani"]];
const STORE = "stalla-filtri-v1";
const isSort = (v: unknown): v is StableSort => STABLE_SORTS.some(([k]) => k === v);

function sortHorses(list: BoardHorse[], sort: StableSort) {
  const by = [...list];
  const num = (v: number | null, dir: 1 | -1) => (v == null ? Infinity : v * dir);
  switch (sort) {
    case "recenti": return by.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    case "meno_recenti": return by.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    case "giovani": return by.sort((a, b) => a.age - b.age);
    case "anziani": return by.sort((a, b) => b.age - a.age);
    case "razza": return by.sort((a, b) => a.breed.localeCompare(b.breed) || a.coat.localeCompare(b.coat));
    case "prezzo_alto": return by.sort((a, b) => num(a.priceValue, -1) - num(b.priceValue, -1));
    case "prezzo_basso": return by.sort((a, b) => num(a.priceValue, 1) - num(b.priceValue, 1));
    case "targa": return by.sort((a, b) => a.plate.localeCompare(b.plate, "it", { numeric: true }));
  }
}

/** Gruppo di pulsanti a scelta singola (stile "segmentato"), leggibile e comodo anche col dito. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="grid gap-1 rounded-lg bg-surface-3 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
            className={clsx("min-h-9 truncate rounded-md px-1.5 text-[13.5px] font-semibold transition-colors", value === k ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StableBoard({ horses, meId, defaultSort }: { horses: BoardHorse[]; meId: number; defaultSort?: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<StableSort>(isSort(defaultSort) ? defaultSort : "recenti");
  const [group, setGroup] = useState(true);
  const [panel, setPanel] = useState(false);
  const loaded = useRef(false);

  // filtri e ordinamento ricordati dal browser
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "null");
      if (v && typeof v === "object") {
        setF({ ...EMPTY, ...(v.f ?? {}), flags: Array.isArray(v.f?.flags) ? v.f.flags.filter((x: string) => FLAGS.some(([k]) => k === x)) : [] });
        if (isSort(v.sort)) setSort(v.sort);
        if (typeof v.group === "boolean") setGroup(v.group);
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(STORE, JSON.stringify({ f, sort, group })); } catch {}
  }, [f, sort, group]);

  const owners = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number }>();
    for (const h of horses) {
      const o = m.get(h.ownerId) ?? { id: h.ownerId, name: h.owner, n: 0 };
      o.n++;
      m.set(h.ownerId, o);
    }
    return [...m.values()].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));
  }, [horses, meId]);
  const breeds = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of horses) m.set(h.breed, (m.get(h.breed) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [horses]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const min = f.ageMin === "" ? null : Number(f.ageMin.replace(",", "."));
    const max = f.ageMax === "" ? null : Number(f.ageMax.replace(",", "."));
    const has = (x: Flag) => f.flags.includes(x);
    const out = horses.filter((h) =>
      (f.owner === "tutti" || (f.owner === "miei" ? h.ownerId === meId : h.ownerId === Number(f.owner))) &&
      (f.sex === "tutti" || h.sexCode === f.sex) &&
      (f.rar === "tutte" || (f.rar === "normali" ? !h.rarity : h.rarity === f.rar)) &&
      (!f.breed || h.breed === f.breed) &&
      (min == null || !Number.isFinite(min) || h.age >= min) &&
      (max == null || !Number.isFinite(max) || h.age <= max + 0.999) &&
      (!has("vendibili") || h.sellable) && (!has("addestrati") || h.trained) && (!has("incinte") || !!h.dueAt) && (!has("puledri") || h.foal) &&
      (!has("completare") || h.needsData) && (!has("giovani") || h.tooYoung) &&
      (!t || matchHorse(h, q) || h.plate.toLowerCase().includes(t)),
    );
    return sortHorses(out, sort);
  }, [horses, f, q, sort, meId]);

  // riepilogo dei filtri attivi (ognuno si toglie con la X)
  const active: { key: string; label: string; clear: () => void }[] = [];
  if (f.owner !== "tutti") active.push({ key: "o", label: f.owner === "miei" ? "Solo i miei" : `Stalliere: ${owners.find((o) => String(o.id) === f.owner)?.name ?? "?"}`, clear: () => setF({ ...f, owner: "tutti" }) });
  if (f.sex !== "tutti") active.push({ key: "s", label: f.sex === "MASCHIO" ? "Maschi" : "Femmine", clear: () => setF({ ...f, sex: "tutti" }) });
  if (f.rar !== "tutte") active.push({ key: "r", label: f.rar === "normali" ? "Normali" : f.rar === "RARO" ? "★ Rari" : "★ Leggendari", clear: () => setF({ ...f, rar: "tutte" }) });
  if (f.breed) active.push({ key: "b", label: f.breed, clear: () => setF({ ...f, breed: "" }) });
  if (f.ageMin || f.ageMax) active.push({ key: "a", label: `Età ${f.ageMin || "0"}–${f.ageMax || "∞"} anni`, clear: () => setF({ ...f, ageMin: "", ageMax: "" }) });
  for (const fl of f.flags) active.push({ key: "f" + fl, label: FLAGS.find(([k]) => k === fl)![1], clear: () => setF({ ...f, flags: f.flags.filter((x) => x !== fl) }) });
  const reset = () => { setF(EMPTY); setQ(""); };

  const groups = group
    ? owners.map((o) => ({ key: o.id, title: o.id === meId ? `I miei cavalli` : o.name, items: list.filter((h) => h.ownerId === o.id) })).filter((g) => g.items.length)
    : [{ key: 0, title: "", items: list }];

  return (
    <>
      <div className="card mb-5 space-y-3 p-3">
        {/* riga principale: ricerca, ordinamento, filtri */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-[1_1_260px]">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-9" placeholder="Cerca razza, manto o targa…" aria-label="Cerca" />
          </div>
          <label className="flex flex-[1_1_200px] items-center gap-2 sm:flex-none">
            <ArrowDownUp size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
            <select className="input sm:!w-auto" value={sort} onChange={(e) => setSort(e.target.value as StableSort)} aria-label="Ordina per">
              {STABLE_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <button type="button" className={clsx("btn flex-1 sm:flex-none", panel || active.length ? "btn-primary" : "btn-secondary")} aria-expanded={panel} aria-controls="pannello-filtri" onClick={() => setPanel((v) => !v)}>
            <SlidersHorizontal size={16} /> Filtri{active.length > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[12px] tabular-nums">{active.length}</span>}
          </button>
        </div>

        {/* pannello filtri */}
        {panel && (
          <div id="pannello-filtri" className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4">
            <Segmented label="Sesso" value={f.sex} onChange={(v) => setF({ ...f, sex: v })} options={[["tutti", "Tutti"], ["MASCHIO", "Maschi"], ["FEMMINA", "Femmine"]]} />
            <div className="sm:col-span-2 xl:col-span-2">
              <Segmented label="Rarità" value={f.rar} onChange={(v) => setF({ ...f, rar: v })} options={[["tutte", "Tutte"], ["normali", "Normali"], ["RARO", "★ Rari"], ["LEGGENDARIO", "★ Leggendari"]]} />
            </div>
            <label className="block">
              <span className="field-label">Razza</span>
              <select className="input" value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })}>
                <option value="">Tutte le razze</option>
                {breeds.map(([b, n]) => <option key={b} value={b}>{b} ({n})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Stalliere</span>
              <select className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
                <option value="tutti">Tutti gli stallieri</option>
                <option value="miei">Solo i miei</option>
                {owners.map((o) => <option key={o.id} value={String(o.id)}>{o.name} ({o.n})</option>)}
              </select>
            </label>
            <div>
              <span className="field-label">Età (anni)</span>
              <div className="flex items-center gap-2">
                <input className="input" inputMode="decimal" placeholder="da" value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: e.target.value })} aria-label="Età minima" />
                <span className="text-fg-3">–</span>
                <input className="input" inputMode="decimal" placeholder="a" value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: e.target.value })} aria-label="Età massima" />
              </div>
            </div>
            <div className="sm:col-span-2 xl:col-span-2">
              <span className="field-label">Mostra solo</span>
              <div className="flex flex-wrap gap-1.5">
                {FLAGS.map(([k, l]) => (
                  <button key={k} type="button" className="chip" aria-pressed={f.flags.includes(k)}
                    onClick={() => setF({ ...f, flags: f.flags.includes(k) ? f.flags.filter((x) => x !== k) : [...f.flags, k] })}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="field-label">Visualizzazione</span>
              <button type="button" className="chip w-full justify-center" aria-pressed={group} onClick={() => setGroup((v) => !v)}>
                {group ? <Users size={15} /> : <LayoutGrid size={15} />} {group ? "Raggruppati per stalliere" : "Tutti insieme"}
              </button>
            </div>
          </div>
        )}

        {/* riepilogo */}
        {(active.length > 0 || q) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <span className="mr-1 text-[13px] font-semibold text-fg-2">{list.length} di {horses.length}</span>
            {active.map((a) => (
              <button key={a.key} type="button" className="chip" aria-pressed="true" onClick={a.clear} aria-label={`Togli filtro ${a.label}`}>{a.label} <X size={14} /></button>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Azzera</button>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty>Nessun cavallo corrisponde ai filtri. <button type="button" className="underline" onClick={reset}>Azzera i filtri</button></Empty></div>
      ) : (
        <div className="space-y-7">
          {groups.map((g) => (
            <section key={g.key}>
              {g.title && (
                <h2 className="mb-3 flex items-baseline gap-2">
                  <span className="h-display text-[20px]">{g.title}</span>
                  <span className="text-[13px] text-fg-3">{g.items.length} {g.items.length === 1 ? "cavallo" : "cavalli"}</span>
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((h) => <HorseCard key={h.id} h={h} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function HorseCard({ h }: { h: BoardHorse }) {
  return (
    <Link href={`/stalla/${h.id}`} style={rarityStyle(h.rarity)} className={clsx("card flex gap-3 p-3 transition-colors hover:border-border-strong", h.mine && !h.rarity && "ring-1 ring-accent/30")}>
      <span className="relative shrink-0">
        <HorseThumb src={h.image} size={72} />
        {h.rarity && (
          <span aria-hidden="true" className="absolute -top-1.5 -left-1.5 flex size-6 items-center justify-center rounded-full text-white shadow ring-2 ring-surface" style={{ background: h.rarity === "RARO" ? "var(--rare)" : "var(--legend)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8Z" /></svg>
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">{h.breed}</div>
            <div className="truncate text-[13.5px] text-fg-3">{h.coat}</div>
          </div>
          <span className="badge badge-neutral font-mono">{h.plate}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
          <RarityBadge rarity={h.rarity} />
          {h.foal && <span className="badge badge-neutral">Puledro</span>}
          {h.trained && <span className="badge badge-ok">Addestrato</span>}
          {h.needsData && <span className="badge badge-warn">Da completare</span>}
          <span className="text-fg-2">{h.sex} · {h.ageText}</span>
          <PregnancyBadge dueAt={h.dueAt} />
          {!h.sellable && !h.needsData && <span className="badge badge-neutral">Troppo giovane</span>}
        </div>
        <div className="mt-2 flex items-end justify-between gap-2 border-t border-border pt-2 text-[12.5px]">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-fg-2">In carico: <b className="text-fg">{h.owner}</b></div>
            <div className="truncate text-fg-3">Catturato da {h.capturedBy}</div>
          </div>
          <b className="text-[15px] whitespace-nowrap">{h.price}</b>
        </div>
      </div>
    </Link>
  );
}

