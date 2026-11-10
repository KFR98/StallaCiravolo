"use client";

import { useState } from "react";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { saveBreed, deleteBreed, saveStats } from "../actions";

type Breed = { id: number; name: string; description: string | null; isCustom: boolean; sortOrder: number; archived: boolean; horses: number };

export function BreedButton({ breed, label, className = "btn btn-ghost btn-sm" }: { breed?: Breed; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={breed ? `Razza: ${breed.name}` : "Nuova razza"}>
        <ActionForm action={saveBreed} onSuccess={() => setOpen(false)} className="space-y-3">
          {breed && <input type="hidden" name="id" value={breed.id} />}
          <label className="block"><span className="label mb-1 block">Nome</span><input name="name" defaultValue={breed?.name} className="input" required /></label>
          <label className="block"><span className="label mb-1 block">Descrizione</span><textarea name="description" defaultValue={breed?.description ?? ""} className="input min-h-[90px]" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label mb-1 block">Ordine</span><input name="sortOrder" type="number" min="0" defaultValue={breed?.sortOrder ?? 0} className="input" /></label>
            <div className="space-y-1 pt-5">
              <label className="flex items-center gap-2"><input type="checkbox" name="isCustom" defaultChecked={breed?.isCustom} className="size-4 accent-[#5a3a22]" />Razza mod/personalizzata</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="archived" defaultChecked={breed?.archived} className="size-4 accent-[#5a3a22]" />Archiviata (nascosta)</label>
            </div>
          </div>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
        {breed && (
          <div className="mt-4 border-t border-dashed border-[#bfa476] pt-3">
            {breed.horses > 0 ? (
              <p className="text-[14px] italic text-ink-soft">Ci sono {breed.horses} cavalli registrati con questa razza: si può solo archiviare.</p>
            ) : (
              <ActionButton action={deleteBreed} fields={{ id: breed.id }} label="Elimina razza e manti" className="btn btn-danger btn-sm" confirm={`Eliminare definitivamente ${breed.name} e tutti i suoi manti?`} />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export function StatsEditor({ stats }: { stats: { id: number; label: string; sortOrder: number }[] }) {
  return (
    <ActionForm action={saveStats} className="space-y-2">
      {stats.map((s) => (
        <div key={s.id} className="grid grid-cols-[1fr_70px] gap-2">
          <input name={`label_${s.id}`} defaultValue={s.label} className="input !py-1" required maxLength={60} />
          <input name={`order_${s.id}`} type="number" defaultValue={s.sortOrder} className="input !py-1" title="Ordine" />
        </div>
      ))}
      <input name="newLabel" className="input !py-1" placeholder="+ Aggiungi statistica (facoltativo)" maxLength={60} />
      <button className="btn btn-primary btn-sm">Salva statistiche</button>
      <p className="text-[12.5px] italic text-ink-soft">Il massimo di ogni barra è calcolato automaticamente dal miglior cavallo del catalogo.</p>
    </ActionForm>
  );
}
