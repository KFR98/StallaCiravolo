"use client";

import { useMemo } from "react";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { HorsePicker, buildHorseOptions } from "@/components/HorsePicker";
import { updateHorse, correctHorse, removeHorse, restoreHorse, transferHorse, setPregnant, updatePregnancy } from "../actions";
import { CONDITIONS } from "@/lib/horses";
import type { BreedOption } from "@/lib/catalog";

export function TransferForm({ horseId, users }: { horseId: number; users: { id: number; displayName: string }[] }) {
  return (
    <ActionForm action={transferHorse} confirm={(fd) => `Passare gratuitamente il cavallo a ${users.find((u) => String(u.id) === fd.get("toUserId"))?.displayName ?? "questo stalliere"}?`} className="space-y-3">
      <input type="hidden" name="horseId" value={horseId} />
      <select name="toUserId" className="input" required defaultValue="">
        <option value="" disabled>Scegli lo stalliere…</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
      </select>
      <input name="notes" className="input" placeholder="Nota (facoltativa)" maxLength={500} />
      <button className="btn btn-secondary w-full">Passa il cavallo</button>
    </ActionForm>
  );
}

export function PregnancyPanel({ horseId, canEdit, state, since, due, dueText, days }: {
  horseId: number; canEdit: boolean; state: "INCINTA" | "PARTO" | null; since: string | null; due: string | null; dueText: string | null; days: number;
}) {
  if (!state) {
    return canEdit ? (
      <ActionForm action={setPregnant} confirm="Segnare la cavalla come incinta (accoppiata ora)?" className="space-y-2">
        <input type="hidden" name="horseId" value={horseId} />
        <p className="text-[14px] text-fg-3">Dopo l&apos;accoppiamento in stalla, segnala qui. Dopo {days} giorni lo stato passa a “Fai partorire”.</p>
        <button className="btn btn-secondary">Segna incinta</button>
      </ActionForm>
    ) : <p className="text-fg-3">Non incinta.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[14.5px]">
        {state === "PARTO" ? <b className="text-warn">È ora di farla partorire.</b> : <>Incinta dal {since}. Parto previsto: <b>{dueText}</b>.</>}
      </p>
      {canEdit && (
        <>
          <ActionForm action={updatePregnancy} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="horseId" value={horseId} />
            <label className="block flex-1"><span className="field-label">Data prevista del parto</span><input type="datetime-local" name="dueAt" defaultValue={due ?? ""} className="input" required /></label>
            <button className="btn btn-secondary">Aggiorna</button>
          </ActionForm>
          <div className="flex flex-wrap gap-2">
            {state === "INCINTA" && <ActionButton action={updatePregnancy} fields={{ horseId, op: "parto_ora" }} label="Pronta a partorire" className="btn btn-secondary btn-sm" />}
            <ActionButton action={updatePregnancy} fields={{ horseId, op: "chiudi", reason: "Partorito" }} label="Ha partorito" className="btn btn-primary btn-sm" confirm="Registrare il parto? Lo stato INCINTA verrà rimosso." />
            <ActionButton action={updatePregnancy} fields={{ horseId, op: "chiudi", reason: "Annullata" }} label="Annulla gravidanza" className="btn btn-ghost btn-sm" confirm="Annullare la gravidanza?" />
          </div>
        </>
      )}
    </div>
  );
}

export function EditHorseForm({ horseId, plate, condition, notes }: { horseId: number; plate: string; condition: string | null; notes: string | null }) {
  return (
    <ActionForm action={updateHorse} className="space-y-3">
      <input type="hidden" name="horseId" value={horseId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="field-label">Targa</span><input name="plate" defaultValue={plate} className="input uppercase" required maxLength={40} /></label>
        <label className="block">
          <span className="field-label">Condizione</span>
          <input name="condition" defaultValue={condition ?? ""} className="input" list="conditions" maxLength={60} />
          <datalist id="conditions">{CONDITIONS.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={notes ?? ""} className="input" maxLength={2000} /></label>
      <button className="btn btn-secondary">Salva</button>
    </ActionForm>
  );
}

export function RemoveHorseForm({ horseId }: { horseId: number }) {
  return (
    <ActionForm action={removeHorse} confirm="Il cavallo uscirà dalla stalla senza vendita (resta nello storico). Confermi?" className="space-y-2">
      <input type="hidden" name="horseId" value={horseId} />
      <label className="block"><span className="field-label">Uscita senza vendita</span><input name="reason" className="input" placeholder="Motivo (morto, liberato, trasferito…)" required minLength={3} maxLength={255} /></label>
      <button className="btn btn-ghost">Registra uscita</button>
    </ActionForm>
  );
}

export function RestoreHorseButton({ horseId }: { horseId: number }) {
  return <ActionButton action={restoreHorse} fields={{ horseId }} label="Riporta in stalla" confirm="Riportare il cavallo in stalla?" className="btn btn-secondary btn-sm" />;
}

export function CorrectHorseForm(props: {
  horseId: number; breeds: BreedOption[]; coatId: number; sex: "MASCHIO" | "FEMMINA" | null; age: number; capturedById: number; users: { id: number; displayName: string }[];
}) {
  const options = useMemo(() => buildHorseOptions(props.breeds), [props.breeds]);
  return (
    <ActionForm action={correctHorse} confirm="Salvare la correzione? Verrà registrata nel registro attività." className="space-y-3">
      <input type="hidden" name="horseId" value={props.horseId} />
      <HorsePicker label="Razza e manto" options={options} value={`c:${props.coatId}`} breedName={null} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="field-label">Sesso</span>
          <select name="sex" className="input" defaultValue={props.sex ?? ""}><option value="">—</option><option value="MASCHIO">Maschio</option><option value="FEMMINA">Femmina</option></select>
        </label>
        <label className="block"><span className="field-label">Età attuale (anni)</span><input name="age" type="number" step="0.01" min="0" max="60" className="input" defaultValue={props.age} /></label>
        <label className="block sm:col-span-2"><span className="field-label">Catturato da</span>
          <select name="capturedById" className="input" defaultValue={props.capturedById}>{props.users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
        </label>
      </div>
      <p className="text-[13px] text-fg-3">Se cambi l&apos;età, da ora continuerà ad avanzare dal nuovo valore.</p>
      <button className="btn btn-secondary">Salva correzione</button>
    </ActionForm>
  );
}
