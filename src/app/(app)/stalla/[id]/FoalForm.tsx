"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ActionForm } from "@/components/ActionForm";
import { HorsePicker, buildHorseOptions } from "@/components/HorsePicker";
import type { BreedOption } from "@/lib/catalog";
import { completeFoal } from "../actions";

/**
 * Completamento dati del puledro: targa, sesso e (una volta) data e ora esatte di nascita.
 * Chi ha il permesso di modifica (direttore, gestore, admin) può anche correggere razza, manto e rarità.
 */
export function FoalForm({ horseId, plate, sex, birth, canSetBirth, staff, breeds, coatId, rarity }: {
  horseId: number; plate: string | null; sex: string | null; birth: string | null; canSetBirth: boolean;
  staff: boolean; breeds: BreedOption[]; coatId: number; rarity: string | null;
}) {
  const [s, setS] = useState(sex ?? "");
  const [r, setR] = useState(rarity ?? "");
  const options = useMemo(() => buildHorseOptions(breeds), [breeds]);
  return (
    <ActionForm action={completeFoal} className="space-y-3">
      <input type="hidden" name="horseId" value={horseId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Targa *</span>
          <input name="plate" defaultValue={plate ?? ""} className="input uppercase" required maxLength={40} placeholder="AB123" autoComplete="off" />
        </label>
        <div>
          <span className="field-label">Sesso *</span>
          <input type="hidden" name="sex" value={s} />
          <div className="grid grid-cols-2 gap-2">
            {(["MASCHIO", "FEMMINA"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={s === k} onClick={() => setS(k)} className={clsx("btn", s === k ? "btn-primary" : "btn-secondary")}>
                {k === "MASCHIO" ? "Maschio" : "Femmina"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {canSetBirth ? (
        <label className="block">
          <span className="field-label">Data e ora esatte di nascita (facoltative, si impostano una sola volta)</span>
          <input type="datetime-local" name="birth" defaultValue={birth ?? ""} className="input" />
          <span className="mt-1 block text-[12.5px] text-fg-3">Da quel momento l&apos;età del puledro parte esattamente dalla nascita.</span>
        </label>
      ) : (
        <p className="text-[13px] text-fg-3">Data e ora di nascita già impostate: per cambiarle serve l&apos;amministratore.</p>
      )}
      {staff && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-[13px] font-semibold text-fg-2">Solo direzione: razza, manto e rarità del puledro</p>
          <HorsePicker options={options} value={`c:${coatId}`} label="Razza e manto" />
          <input type="hidden" name="rarity" value={r} />
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Rarità del puledro">
            {([["", "Normale", null], ["RARO", "★ Raro", "var(--rare)"], ["LEGGENDARIO", "★ Leggendario", "var(--legend)"]] as const).map(([k, l, c]) => (
              <button key={k || "n"} type="button" role="radio" aria-checked={r === k} onClick={() => setR(k)}
                className={clsx("min-h-10 rounded-md text-[14px] font-semibold transition-colors", r === k ? (c ? "text-white shadow-sm" : "bg-surface text-fg shadow-sm") : "text-fg-3 hover:text-fg")}
                style={r === k && c ? { background: c } : undefined}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <button className="btn btn-primary w-full" disabled={!s}>Salva dati del puledro</button>
    </ActionForm>
  );
}
