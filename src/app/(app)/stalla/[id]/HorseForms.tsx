"use client";

import { useState } from "react";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { updateHorse, correctHorse, removeHorse, restoreHorse } from "../actions";
import { CONDITIONS } from "@/lib/horses";
import type { BreedOption } from "@/lib/catalog";

export function EditHorseForm({ horseId, plate, condition, notes }: { horseId: number; plate: string; condition: string | null; notes: string | null }) {
  return (
    <ActionForm action={updateHorse} className="space-y-3">
      <input type="hidden" name="horseId" value={horseId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 block">Targa</span>
          <input name="plate" defaultValue={plate} className="input uppercase" required maxLength={40} />
        </label>
        <label className="block">
          <span className="label mb-1 block">Condizione</span>
          <input name="condition" defaultValue={condition ?? ""} className="input" list="conditions" maxLength={60} />
          <datalist id="conditions">{CONDITIONS.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <label className="block">
        <span className="label mb-1 block">Note</span>
        <textarea name="notes" defaultValue={notes ?? ""} className="input min-h-[70px]" maxLength={2000} />
      </label>
      <button className="btn btn-primary">Salva</button>
    </ActionForm>
  );
}

export function RemoveHorseForm({ horseId }: { horseId: number }) {
  return (
    <ActionForm action={removeHorse} confirm="Il cavallo uscirà dalla stalla senza vendita (resta nello storico). Confermi?" className="space-y-2">
      <input type="hidden" name="horseId" value={horseId} />
      <label className="block">
        <span className="label mb-1 block">Uscita senza vendita</span>
        <input name="reason" className="input" placeholder="Motivo (es. morto, liberato, trasferito)" required minLength={3} maxLength={255} />
      </label>
      <button className="btn btn-ghost">Registra uscita</button>
    </ActionForm>
  );
}

export function RestoreHorseButton({ horseId }: { horseId: number }) {
  return <ActionButton action={restoreHorse} fields={{ horseId }} label="Riporta in stalla" confirm="Riportare il cavallo in stalla?" />;
}

export function CorrectHorseForm(props: {
  horseId: number;
  breeds: BreedOption[];
  coatId: number;
  sex: "MASCHIO" | "FEMMINA";
  age: number;
  capturedById: number;
  users: { id: number; displayName: string }[];
}) {
  const startBreed = props.breeds.find((b) => b.coats.some((c) => c.id === props.coatId));
  const [breedId, setBreedId] = useState<number | undefined>(startBreed?.id);
  const breed = props.breeds.find((b) => b.id === breedId);
  return (
    <ActionForm action={correctHorse} confirm="Salvare la correzione? Verrà registrata nel registro attività." className="space-y-3">
      <input type="hidden" name="horseId" value={props.horseId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 block">Razza</span>
          <select className="input" value={breedId ?? ""} onChange={(e) => setBreedId(Number(e.target.value))}>
            {props.breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1 block">Manto</span>
          <select name="coatId" className="input" defaultValue={props.coatId} key={breedId}>
            {breed?.coats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1 block">Sesso</span>
          <select name="sex" className="input" defaultValue={props.sex}>
            <option value="MASCHIO">Maschio</option>
            <option value="FEMMINA">Femmina</option>
          </select>
        </label>
        <label className="block">
          <span className="label mb-1 block">Età attuale (anni)</span>
          <input name="age" type="number" step="0.01" min="0" max="60" className="input" defaultValue={props.age} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label mb-1 block">Catturato da</span>
          <select name="capturedById" className="input" defaultValue={props.capturedById}>
            {props.users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </select>
        </label>
      </div>
      <p className="text-[13px] text-ink-soft italic">Se cambi l&apos;età, da ora continuerà ad avanzare partendo dal nuovo valore.</p>
      <button className="btn btn-primary">Salva correzione</button>
    </ActionForm>
  );
}
