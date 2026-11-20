"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus, X } from "lucide-react";
import clsx from "clsx";
import { ActionForm } from "@/components/ActionForm";
import { sellHorse } from "../actions";
import { applyDiscount, round2, type Bracket } from "@/lib/pricing";
import { money } from "@/lib/format";

export type SellShopItem = { id: number; name: string; price: number; group: string | null };
type Choice = "A" | "B" | "LIBERO";

const isShoes = (name: string, kind: "classici" | "migliorati") => {
  const n = name.toLowerCase();
  return n.includes("ferri") && n.includes(kind === "classici" ? "classic" : "miglior") && n.includes("4");
};

export function SellForm(props: {
  horseId: number; version: number; bracket: Bracket; age: number;
  minSaleAge: number; bracketAMax: number; bracketBMax: number;
  basePriceA: number | null; basePriceB: number | null; trainingPrice: number | null;
  canOverride: boolean; maxDiscount: number; pregnant: boolean; shopItems: SellShopItem[];
}) {
  const computed: Choice | null = props.bracket === "TROPPO_GIOVANE" ? null : props.bracket;
  const [choice, setChoice] = useState<Choice | null>(computed);
  const [training, setTraining] = useState(false);
  const [shoes, setShoes] = useState<"" | "classici" | "migliorati">("");
  const [extra, setExtra] = useState<Map<number, number>>(new Map());
  const [pick, setPick] = useState("");
  const [manual, setManual] = useState("");
  const [dType, setDType] = useState<"" | "PERCENTUALE" | "IMPORTO">("");
  const [dValue, setDValue] = useState("");

  const shoeItems = {
    classici: props.shopItems.find((i) => isShoes(i.name, "classici")),
    migliorati: props.shopItems.find((i) => isShoes(i.name, "migliorati")),
  };
  const otherItems = props.shopItems.filter((i) => i !== shoeItems.classici && i !== shoeItems.migliorati);

  const lines = useMemo(() => {
    const out: { item: SellShopItem; qty: number }[] = [];
    const shoeItem = shoes ? shoeItems[shoes] : undefined;
    if (shoeItem) out.push({ item: shoeItem, qty: 1 });
    for (const [id, qty] of extra) {
      const it = props.shopItems.find((x) => x.id === id);
      if (it) out.push({ item: it, qty });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoes, extra, props.shopItems]);
  const tooYoung = computed == null;
  if (tooYoung && !props.canOverride) {
    return (
      <p className="text-fg-2">
        Secondo il calcolo il cavallo ha {props.age.toFixed(1)} anni: si vende dai {props.minSaleAge} anni.
        Se l&apos;età è sbagliata, direttore o admin possono venderlo scegliendo la fascia giusta.
      </p>
    );
  }

  const listBase = choice === "A" ? props.basePriceA : choice === "B" ? props.basePriceB : null;
  const needsManual = choice === "LIBERO" || (choice != null && listBase == null);
  const manualNum = manual !== "" ? Number(manual.replace(",", ".")) : null;
  const base = needsManual || (props.canOverride && manualNum != null) ? manualNum ?? 0 : listBase ?? 0;
  const trainingCost = training && props.trainingPrice != null ? props.trainingPrice : 0;
  const horsePrice = round2((Number.isFinite(base) ? base : 0) + trainingCost);
  const horseFinal = applyDiscount(horsePrice, dType || null, dValue ? Number(dValue.replace(",", ".")) : null);

  const itemsTotal = round2(lines.reduce((a, l) => a + l.item.price * l.qty, 0));
  const total = round2(horseFinal + itemsTotal);

  const setQty = (id: number, qty: number) =>
    setExtra((m) => {
      const n = new Map(m);
      if (qty <= 0) n.delete(id);
      else n.set(id, Math.min(99, qty));
      return n;
    });

  const bracketBtn = (c: Choice, title: string, price: number | null) => (
    <button
      key={c}
      type="button"
      role="radio"
      aria-checked={choice === c}
      onClick={() => setChoice(c)}
      className={clsx(
        "flex min-h-14 flex-col items-center justify-center rounded-md px-2 py-1.5 text-center transition-colors",
        choice === c ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg",
      )}
    >
      <span className="text-[13.5px] font-semibold">{title}</span>
      <span className="text-[12.5px] tabular-nums">{c === "LIBERO" ? "prezzo libero" : price != null ? money(price) : "—"}</span>
      {computed === c && <span className="text-[11px] font-semibold text-accent-text">età calcolata</span>}
    </button>
  );

  return (
    <ActionForm
      action={sellHorse}
      confirm={() => {
        const what = `${money(total)}${itemsTotal ? ` (cavallo ${money(horseFinal)} + oggetti ${money(itemsTotal)})` : ""}`;
        return props.pregnant ? `ATTENZIONE: la cavalla è INCINTA.\nÈ meglio non venderla prima del parto. Vuoi venderla comunque per ${what}?` : `Confermi la vendita per ${what}?`;
      }}
      className="space-y-4"
    >
      <input type="hidden" name="horseId" value={props.horseId} />
      <input type="hidden" name="version" value={props.version} />
      <input type="hidden" name="bracket" value={choice ?? ""} />
      <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ id: l.item.id, qty: l.qty })))} />
      {training && <input type="hidden" name="withTraining" value="on" />}

      {props.pregnant && (
        <div className="flex gap-2 rounded-lg bg-warn-soft p-3 text-[14px] text-warn" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>La cavalla è incinta: è sconsigliato venderla prima del parto.</span>
        </div>
      )}

      {/* 1. Fascia d'età */}
      <div>
        <span className="field-label">Fascia d&apos;età · calcolata: {props.age.toFixed(1)} anni</span>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Fascia di prezzo">
          {bracketBtn("A", `${props.minSaleAge}-${props.bracketAMax} anni`, props.basePriceA)}
          {bracketBtn("B", `${props.bracketAMax + 1}-${props.bracketBMax} anni`, props.basePriceB)}
          {bracketBtn("LIBERO", `Oltre ${props.bracketBMax}`, null)}
        </div>
        {tooYoung && <p className="mt-1.5 text-[13px] text-warn">Età calcolata sotto i {props.minSaleAge} anni: scegli la fascia giusta solo se l&apos;età è sbagliata.</p>}
        {!tooYoung && choice !== computed && <p className="mt-1.5 text-[13px] text-warn">Fascia cambiata a mano: verrà indicato nelle note della vendita.</p>}
      </div>

      {choice && (
        <>
          {(needsManual || props.canOverride) && (
            <label className="block">
              <span className="field-label">{needsManual ? "Prezzo base deciso dallo stalliere *" : "Prezzo base diverso dal listino"}</span>
              <input name="manualPrice" type="number" step="0.01" min="0" className="input" required={needsManual} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={listBase != null ? String(listBase) : ""} />
            </label>
          )}

          {/* 2. Addestramento */}
          <label className={clsx("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5", training ? "border-accent bg-accent-soft" : "border-border")}>
            <span className="flex items-center gap-2.5">
              <input type="checkbox" checked={training} disabled={props.trainingPrice == null} onChange={(e) => setTraining(e.target.checked)} className="size-4" />
              <span className="font-semibold">Con addestramento</span>
            </span>
            <span className="tabular-nums text-fg-2">{props.trainingPrice != null ? `+ ${money(props.trainingPrice)}` : "non in listino"}</span>
          </label>

          {/* 3. Ferri */}
          {(shoeItems.classici || shoeItems.migliorati) && (
            <div>
              <span className="field-label">Ferri</span>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Ferri">
                {([["", "Nessuno", null], ["classici", "4 normali", shoeItems.classici], ["migliorati", "4 migliorati", shoeItems.migliorati]] as const).map(([k, l, it]) =>
                  k && !it ? null : (
                    <button key={k || "no"} type="button" role="radio" aria-checked={shoes === k} onClick={() => setShoes(k)}
                      className={clsx("flex min-h-12 flex-col items-center justify-center rounded-md px-2 text-[13.5px] font-semibold transition-colors", shoes === k ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>
                      {l}
                      {it && <span className="text-[12px] font-normal tabular-nums">+ {money(it.price)}</span>}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {/* 4. Oggetti della bottega */}
          <div>
            <span className="field-label">Oggetti venduti con il cavallo (sella, coperta…)</span>
            <div className="flex gap-2">
              <select className="input flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Scegli un oggetto della bottega">
                <option value="">Scegli un oggetto…</option>
                {Object.entries(groupBy(otherItems)).map(([g, items]) => (
                  <optgroup key={g} label={g}>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {money(i.price)}</option>)}
                  </optgroup>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" disabled={!pick} onClick={() => { const id = Number(pick); setQty(id, (extra.get(id) ?? 0) + 1); setPick(""); }}>
                <Plus size={16} /> Aggiungi
              </button>
            </div>
            {extra.size > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {[...extra].map(([id, qty]) => {
                  const it = props.shopItems.find((x) => x.id === id);
                  if (!it) return null;
                  return (
                    <li key={id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setQty(id, qty - 1)} aria-label={`Togli un ${it.name}`}><Minus size={14} /></button>
                      <span className="w-6 text-center tabular-nums">{qty}</span>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setQty(id, qty + 1)} aria-label={`Aggiungi un ${it.name}`}><Plus size={14} /></button>
                      <span className="w-20 text-right tabular-nums">{money(it.price * qty)}</span>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setQty(id, 0)} aria-label={`Rimuovi ${it.name}`}><X size={14} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 5. Sconto (solo sul cavallo) */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Sconto sul cavallo</span>
              <select name="discountType" className="input" value={dType} onChange={(e) => setDType(e.target.value as typeof dType)}>
                <option value="">Nessuno</option>
                <option value="PERCENTUALE">Percentuale %</option>
                <option value="IMPORTO">Importo $</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Valore</span>
              <input name="discountValue" type="number" step="0.01" min="0" className="input" disabled={!dType} value={dValue} onChange={(e) => setDValue(e.target.value)} />
            </label>
          </div>
          <label className="block"><span className="field-label">Acquirente</span><input name="buyerName" className="input" maxLength={120} placeholder="Facoltativo" /></label>
          <label className="block"><span className="field-label">Note</span><input name="notes" className="input" maxLength={2000} placeholder="Facoltative" /></label>

          {/* Riepilogo */}
          <dl className="space-y-1 rounded-lg bg-surface-3 px-3 py-2.5 text-[14.5px]">
            <Row label="Prezzo base" value={money(Number.isFinite(base) ? base : 0)} />
            {trainingCost > 0 && <Row label="Addestramento" value={`+ ${money(trainingCost)}`} />}
            {horseFinal !== horsePrice && <Row label="Sconto" value={`− ${money(round2(horsePrice - horseFinal))}`} />}
            {lines.map((l) => <Row key={l.item.id} label={`${l.qty > 1 ? l.qty + "× " : ""}${l.item.name}`} value={`+ ${money(l.item.price * l.qty)}`} />)}
            <div className="flex items-center justify-between border-t border-border pt-1.5">
              <dt className="font-semibold">Totale</dt>
              <dd className="text-[22px] font-bold tabular-nums">{money(total)}</dd>
            </div>
          </dl>
          <button className="btn btn-primary w-full">Vendi cavallo</button>
        </>
      )}
    </ActionForm>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-2">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function groupBy(items: SellShopItem[]) {
  const out: Record<string, SellShopItem[]> = {};
  for (const i of items) (out[i.group || "Altro"] ??= []).push(i);
  return out;
}
