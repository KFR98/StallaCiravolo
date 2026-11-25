"use client";

import { useMemo } from "react";
import { AlertTriangle, X } from "lucide-react";
import clsx from "clsx";
import { HorsePicker, type HorseOption } from "@/components/HorsePicker";
import { HorseThumb } from "@/components/ui";
import { SaleTag } from "@/components/SaleTag";
import { money } from "@/lib/format";
import { round2 } from "@/lib/pricing";

type Choice = "A" | "B" | "LIBERO";

/** Cavallo della stalla vendibile da chi apre la cassa (i prezzi li ricalcola comunque il server). */
export type SellableHorse = {
  id: number; version: number; breed: string; coat: string; plate: string | null; image: string | null; owner: string;
  age: number; computed: Choice | null; basePriceA: number | null; basePriceB: number | null; trainingPrice: number | null;
  rarity: "RARO" | "LEGGENDARIO" | null; trained: boolean; pregnant: boolean;
};
export type HorseRules = {
  minSaleAge: number; bracketAMax: number; bracketBMax: number; rareBasePrice: number; rareTrainingPrice: number;
  canOverride: boolean; canSellUnderage: boolean;
};
export type HorseSel = { id: number; choice: Choice | null; training: boolean; manual: string };

/** Stato iniziale quando si sceglie un cavallo (fascia calcolata, prezzo proposto per i rari, addestramento se già fatto). */
export function initialSel(h: SellableHorse, r: HorseRules): HorseSel {
  return { id: h.id, choice: h.rarity ? "LIBERO" : h.computed, training: h.trained, manual: h.rarity ? String(r.rareBasePrice) : "" };
}

/** Prezzo del cavallo con le stesse regole del server (solo anteprima). */
export function horseQuote(h: SellableHorse, sel: HorseSel, r: HorseRules) {
  const rare = !!h.rarity;
  const listBase = rare ? null : sel.choice === "A" ? h.basePriceA : sel.choice === "B" ? h.basePriceB : null;
  const needsManual = rare || sel.choice === "LIBERO" || (sel.choice != null && listBase == null);
  const manualNum = sel.manual.trim() !== "" ? Number(sel.manual.replace(",", ".")) : null;
  const base = needsManual || (r.canOverride && manualNum != null) ? manualNum ?? 0 : listBase ?? 0;
  const trainingRef = rare ? r.rareTrainingPrice : h.trainingPrice;
  const training = (sel.training || h.trained) && trainingRef != null ? trainingRef : 0;
  const ok = sel.choice != null && Number.isFinite(base) && (!needsManual || manualNum != null);
  return { listBase, needsManual, base: Number.isFinite(base) ? base : 0, trainingRef, training, price: round2((Number.isFinite(base) ? base : 0) + training), ok };
}

export function HorseSaleBlock({ horses, rules, sel, onChange }: { horses: SellableHorse[]; rules: HorseRules; sel: HorseSel | null; onChange: (s: HorseSel | null) => void }) {
  const options: HorseOption[] = useMemo(
    () => horses.map((h) => ({
      key: `h:${h.id}`, breedId: 0, coatId: null, breed: h.breed, coat: `${h.coat}${h.plate ? ` · ${h.plate}` : ""}`, image: h.image,
      meta: [h.rarity === "RARO" ? "raro" : h.rarity === "LEGGENDARIO" ? "leggendario" : `${h.age.toFixed(1)} anni`, h.trained ? "addestrato" : null, h.pregnant ? "incinta" : null, h.owner].filter(Boolean).join(" · "),
    })),
    [horses],
  );
  const h = sel ? horses.find((x) => x.id === sel.id) ?? null : null;

  return (
    <div className="card card-pad">
      <h3 className="mb-1 flex items-center gap-2 font-semibold"><SaleTag kind="cavallo" /> Cavallo della stalla</h3>
      <p className="mb-3 text-[13.5px] text-fg-3">Facoltativo: un cavallo per fattura. Addestramenti di altri cavalli e oggetti si aggiungono sotto.</p>
      {!h ? (
        horses.length ? (
          <HorsePicker label="Cavallo da vendere" options={options} breedName={null} coatName={null} placeholder="Cerca razza, manto o targa…"
            onChange={(o) => { const x = o && horses.find((y) => `h:${y.id}` === o.key); onChange(x ? initialSel(x, rules) : null); }} />
        ) : <p className="rounded-lg border border-dashed border-border p-3 text-[14px] text-fg-3">Non hai cavalli in stalla da vendere.</p>
      ) : (
        <HorseSettings h={h} sel={sel!} rules={rules} onChange={onChange} />
      )}
    </div>
  );
}

function HorseSettings({ h, sel, rules: r, onChange }: { h: SellableHorse; sel: HorseSel; rules: HorseRules; onChange: (s: HorseSel | null) => void }) {
  const q = horseQuote(h, sel, r);
  const rare = !!h.rarity;
  const tooYoung = h.computed == null;
  const set = (patch: Partial<HorseSel>) => onChange({ ...sel, ...patch });
  const btn = (c: Choice, title: string, price: number | null) => (
    <button key={c} type="button" role="radio" aria-checked={sel.choice === c} onClick={() => set({ choice: c })}
      className={clsx("flex min-h-14 flex-col items-center justify-center rounded-md px-2 py-1.5 text-center transition-colors", sel.choice === c ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>
      <span className="text-[13.5px] font-semibold">{title}</span>
      <span className="text-[12.5px] tabular-nums">{c === "LIBERO" ? "prezzo libero" : price != null ? money(price) : "—"}</span>
      {h.computed === c && <span className="text-[11px] font-semibold text-accent-text">età calcolata</span>}
    </button>
  );

  if (tooYoung && !r.canSellUnderage) {
    return (
      <div className="space-y-2">
        <Chosen h={h} onClear={() => onChange(null)} />
        <p className="text-fg-2">Secondo il calcolo il cavallo ha {h.age.toFixed(1)} anni: si vende dai {r.minSaleAge} anni. Se l&apos;età è sbagliata, direttore, gestore o admin possono venderlo.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Chosen h={h} onClear={() => onChange(null)} />
      {h.pregnant && (
        <div className="flex gap-2 rounded-lg bg-warn-soft p-3 text-[14px] text-warn" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>La cavalla è incinta: è sconsigliato venderla prima del parto.</span>
        </div>
      )}
      {rare ? (
        <div className="rounded-lg border px-3 py-2.5 text-[14px]" style={{ borderColor: h.rarity === "RARO" ? "var(--rare)" : "var(--legend)" }}>
          <b style={{ color: h.rarity === "RARO" ? "var(--rare)" : "var(--legend)" }}>★ Cavallo {h.rarity === "RARO" ? "raro" : "leggendario"}</b>
          <span className="text-fg-2"> · prezzo libero deciso da te. Proposto: {money(r.rareBasePrice)} di base.</span>
        </div>
      ) : (
        <div>
          <span className="field-label">Fascia d&apos;età · calcolata: {h.age.toFixed(1)} anni</span>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Fascia di prezzo">
            {btn("A", `${r.minSaleAge}-${r.bracketAMax} anni`, h.basePriceA)}
            {btn("B", `${r.bracketAMax + 1}-${r.bracketBMax} anni`, h.basePriceB)}
            {btn("LIBERO", `Oltre ${r.bracketBMax}`, null)}
          </div>
          {tooYoung && <p className="mt-1.5 text-[13px] text-warn">Età calcolata sotto i {r.minSaleAge} anni: scegli la fascia giusta solo se l&apos;età è sbagliata.</p>}
          {!tooYoung && sel.choice !== h.computed && <p className="mt-1.5 text-[13px] text-warn">Fascia cambiata a mano: verrà indicato nelle note della vendita.</p>}
        </div>
      )}
      {sel.choice && (q.needsManual || r.canOverride) && (
        <label className="block">
          <span className="field-label">{rare ? "Prezzo del cavallo (libero) *" : q.needsManual ? "Prezzo base deciso dallo stalliere *" : "Prezzo base diverso dal listino"}</span>
          <input type="number" step="0.01" min="0" className="input" value={sel.manual} onChange={(e) => set({ manual: e.target.value })} placeholder={q.listBase != null ? String(q.listBase) : ""} />
        </label>
      )}
      <label className={clsx("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5", sel.training || h.trained ? "border-accent bg-accent-soft" : "border-border")}>
        <span className="flex items-center gap-2.5">
          <input type="checkbox" checked={sel.training || h.trained} disabled={q.trainingRef == null || h.trained} onChange={(e) => set({ training: e.target.checked })} className="size-4" />
          <span className="font-semibold">{h.trained ? "Già addestrato (compreso nel prezzo)" : "Con addestramento"}</span>
        </span>
        <span className="tabular-nums text-fg-2">{q.trainingRef != null ? `+ ${money(q.trainingRef)}` : "non in listino"}</span>
      </label>
      <div className="flex items-center justify-between rounded-lg bg-surface-3 px-3 py-2 text-[14.5px]">
        <span className="text-fg-2">Prezzo del cavallo{q.training ? " (con addestramento)" : ""}</span>
        <b className="tabular-nums">{q.ok ? money(q.price) : "—"}</b>
      </div>
    </div>
  );
}

function Chosen({ h, onClear }: { h: SellableHorse; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
      <HorseThumb src={h.image} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{h.breed} – {h.coat}</div>
        <div className="text-[13px] text-fg-3">{[h.plate && `Targa ${h.plate}`, `${h.age.toFixed(1)} anni`, h.owner].filter(Boolean).join(" · ")}</div>
      </div>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClear} aria-label="Togli il cavallo dalla fattura"><X size={16} /></button>
    </div>
  );
}
