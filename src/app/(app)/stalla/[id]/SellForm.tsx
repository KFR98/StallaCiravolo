"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { sellHorse } from "../actions";
import { applyDiscount, type Bracket } from "@/lib/pricing";
import { money } from "@/lib/format";

export function SellForm(props: {
  horseId: number; version: number; bracket: Bracket; bracketText: string; listPrice: number | null;
  canOverride: boolean; maxDiscount: number; minSaleAge: number; pregnant: boolean;
}) {
  const needsManual = props.bracket === "LIBERO" || (props.listPrice == null && props.bracket !== "TROPPO_GIOVANE");
  const [manual, setManual] = useState("");
  const [dType, setDType] = useState<"" | "PERCENTUALE" | "IMPORTO">("");
  const [dValue, setDValue] = useState("");

  if (props.bracket === "TROPPO_GIOVANE") {
    return <p className="text-fg-2">Il cavallo non ha ancora {props.minSaleAge} anni: potrà essere venduto quando raggiunge l&apos;età minima.</p>;
  }
  const base = manual !== "" ? Number(manual.replace(",", ".")) : props.listPrice ?? 0;
  const final = applyDiscount(Number.isFinite(base) ? base : 0, dType || null, dValue ? Number(dValue.replace(",", ".")) : null);

  return (
    <ActionForm
      action={sellHorse}
      confirm={() => (props.pregnant ? `ATTENZIONE: la cavalla è INCINTA.\nÈ meglio non venderla prima del parto. Vuoi venderla comunque per ${money(final)}?` : `Confermi la vendita per ${money(final)}?`)}
      className="space-y-3"
    >
      <input type="hidden" name="horseId" value={props.horseId} />
      <input type="hidden" name="version" value={props.version} />
      {props.pregnant && (
        <div className="flex gap-2 rounded-lg bg-warn-soft p-3 text-[14px] text-warn" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>La cavalla è incinta: è sconsigliato venderla prima del parto.</span>
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <span className="text-fg-3">{props.bracketText}</span>
        <b className="text-[17px]">{props.listPrice != null ? money(props.listPrice) : "Prezzo libero"}</b>
      </div>
      {(needsManual || props.canOverride) && (
        <label className="block">
          <span className="field-label">{needsManual ? "Prezzo deciso dallo stalliere *" : "Prezzo diverso dal listino"}</span>
          <input name="manualPrice" type="number" step="0.01" min="0" className="input" required={needsManual} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={props.listPrice != null ? String(props.listPrice) : ""} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">Sconto</span>
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
      <div className="flex items-center justify-between rounded-lg bg-surface-3 px-3 py-2.5">
        <span className="font-semibold">Prezzo scontato finale</span>
        <span className="text-[22px] font-bold tabular-nums">{money(final)}</span>
      </div>
      <button className="btn btn-primary w-full">Vendi cavallo</button>
    </ActionForm>
  );
}
