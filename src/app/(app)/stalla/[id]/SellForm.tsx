"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { sellHorse } from "../actions";
import { applyDiscount } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { Bracket } from "@/lib/pricing";

export function SellForm(props: {
  horseId: number;
  version: number;
  bracket: Bracket;
  bracketText: string;
  listPrice: number | null;
  canOverride: boolean;
  maxDiscount: number;
  minSaleAge: number;
}) {
  const needsManual = props.bracket === "LIBERO" || (props.listPrice == null && props.bracket !== "TROPPO_GIOVANE");
  const [manual, setManual] = useState<string>("");
  const [dType, setDType] = useState<"" | "PERCENTUALE" | "IMPORTO">("");
  const [dValue, setDValue] = useState<string>("");

  if (props.bracket === "TROPPO_GIOVANE") {
    return (
      <p className="italic text-blood">
        Il cavallo non ha ancora {props.minSaleAge} anni: non può essere venduto. Puoi venderlo quando raggiunge l&apos;età minima.
      </p>
    );
  }

  const base = manual !== "" ? Number(manual.replace(",", ".")) : props.listPrice ?? 0;
  const final = applyDiscount(Number.isFinite(base) ? base : 0, dType || null, dValue ? Number(dValue.replace(",", ".")) : null);

  return (
    <ActionForm
      action={sellHorse}
      confirm={() => `Confermi la vendita per ${money(final)}?`}
      className="space-y-3"
    >
      <input type="hidden" name="horseId" value={props.horseId} />
      <input type="hidden" name="version" value={props.version} />
      <div className="flex justify-between text-[15.5px]">
        <span className="text-ink-soft">Fascia</span>
        <span>{props.bracketText}</span>
      </div>
      <div className="flex justify-between text-[15.5px]">
        <span className="text-ink-soft">Prezzo di listino</span>
        <b>{props.listPrice != null ? money(props.listPrice) : "Libero"}</b>
      </div>
      {(needsManual || props.canOverride) && (
        <label className="block">
          <span className="label mb-1 block">{needsManual ? "Prezzo deciso dallo stalliere *" : "Prezzo diverso dal listino (facoltativo)"}</span>
          <input name="manualPrice" type="number" step="0.01" min="0" className="input" required={needsManual} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={props.listPrice != null ? String(props.listPrice) : ""} />
        </label>
      )}
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <label className="block">
          <span className="label mb-1 block">Sconto</span>
          <select name="discountType" className="input" value={dType} onChange={(e) => setDType(e.target.value as typeof dType)}>
            <option value="">Nessuno</option>
            <option value="PERCENTUALE">Percentuale %</option>
            <option value="IMPORTO">Importo $</option>
          </select>
        </label>
        <label className="block">
          <span className="label mb-1 block">Valore</span>
          <input name="discountValue" type="number" step="0.01" min="0" className="input" disabled={!dType} value={dValue} onChange={(e) => setDValue(e.target.value)} />
        </label>
      </div>
      {!props.canOverride && props.maxDiscount < 100 && <p className="text-[13px] text-ink-soft italic">Sconto massimo: {props.maxDiscount}%</p>}
      <label className="block">
        <span className="label mb-1 block">Acquirente</span>
        <input name="buyerName" className="input" maxLength={120} placeholder="Nome del cliente (facoltativo)" />
      </label>
      <label className="block">
        <span className="label mb-1 block">Note</span>
        <textarea name="notes" className="input min-h-[60px]" maxLength={2000} />
      </label>
      <div className="flex items-center justify-between rounded-[3px] border border-gold/60 bg-gold-bright/15 px-3 py-2">
        <span className="title-fell tracking-[0.08em] uppercase">Prezzo scontato finale</span>
        <span className="text-[22px] font-bold tabular-nums">{money(final)}</span>
      </div>
      <button className="btn btn-danger w-full py-3 text-[17px]">Vendi cavallo</button>
    </ActionForm>
  );
}
