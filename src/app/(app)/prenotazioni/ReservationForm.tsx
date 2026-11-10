"use client";

import { useState } from "react";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { saveReservation, deleteReservation } from "./actions";
import type { BreedOption } from "@/lib/catalog";
import { RES_STATUS } from "./status";

export type ResData = {
  id?: number; title?: string | null; customerName?: string | null; missiva?: string | null; breedId?: number | null; coatId?: number | null;
  plate?: string | null; price?: number | null; deposit?: number | null; deliveryDate?: string | null; status?: string; assignedToId?: number | null; notes?: string | null;
};

export function ReservationButton({ data, breeds, users, label, className, canDelete }: { data?: ResData; breeds: BreedOption[]; users: { id: number; displayName: string }[]; label: string; className?: string; canDelete?: boolean }) {
  const [open, setOpen] = useState(false);
  const [breedId, setBreedId] = useState<number | "">(data?.breedId ?? "");
  const breed = breeds.find((b) => b.id === breedId);
  const [price, setPrice] = useState(data?.price != null ? String(data.price) : "");
  const [deposit, setDeposit] = useState(data?.deposit != null ? String(data.deposit) : "");
  const balance = price !== "" ? Number(price) - (Number(deposit) || 0) : null;
  return (
    <>
      <button type="button" className={className ?? "btn btn-ghost btn-sm"} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={data?.id ? "Modifica nota / prenotazione" : "Nuova nota / prenotazione"} wide>
        <ActionForm action={saveReservation} onSuccess={() => setOpen(false)} className="grid gap-3 sm:grid-cols-2">
          {data?.id && <input type="hidden" name="id" value={data.id} />}
          <label className="block sm:col-span-2"><span className="label mb-1 block">Titolo</span><input name="title" defaultValue={data?.title ?? ""} className="input" placeholder="Es. Arabo bianco per lo sceriffo" maxLength={150} /></label>
          <label className="block"><span className="label mb-1 block">Cliente</span><input name="customerName" defaultValue={data?.customerName ?? ""} className="input" maxLength={120} /></label>
          <label className="block"><span className="label mb-1 block">Missiva</span><input name="missiva" defaultValue={data?.missiva ?? ""} className="input" maxLength={40} /></label>
          <label className="block"><span className="label mb-1 block">Razza</span>
            <select name="breedId" className="input" value={breedId} onChange={(e) => setBreedId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">—</option>{breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label mb-1 block">Manto</span>
            <select name="coatId" className="input" defaultValue={data?.coatId ?? ""} key={String(breedId)}>
              <option value="">—</option>{breed?.coats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label mb-1 block">Stato</span>
            <select name="status" className="input" defaultValue={data?.status ?? "PRENOTATO"}>
              {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label mb-1 block">Prenotato per lo stalliere</span>
            <select name="assignedToId" className="input" defaultValue={data?.assignedToId ?? ""}>
              <option value="">Nessuno / tutti</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </select>
          </label>
          <label className="block"><span className="label mb-1 block">Targa</span><input name="plate" defaultValue={data?.plate ?? ""} className="input uppercase" maxLength={40} /></label>
          <label className="block"><span className="label mb-1 block">Data di consegna</span><input type="date" name="deliveryDate" defaultValue={data?.deliveryDate ?? ""} className="input" /></label>
          <label className="block"><span className="label mb-1 block">Prezzo</span><input name="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" /></label>
          <label className="block"><span className="label mb-1 block">Acconto</span><input name="deposit" type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input" /></label>
          <div className="sm:col-span-2 text-right">Saldo da incassare: <b>{balance != null && Number.isFinite(balance) ? "$" + balance.toLocaleString("it-IT") : "—"}</b></div>
          <label className="block sm:col-span-2"><span className="label mb-1 block">Note</span><textarea name="notes" defaultValue={data?.notes ?? ""} className="input min-h-[100px]" maxLength={5000} /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className="btn btn-primary flex-1">Salva</button>
          </div>
        </ActionForm>
        {data?.id && canDelete && (
          <div className="mt-4 border-t border-dashed border-[#bfa476] pt-3 text-right">
            <ActionButton action={deleteReservation} fields={{ id: data.id }} label="Elimina definitivamente" className="btn btn-danger btn-sm" confirm="Eliminare questa nota? L'operazione resta nel registro attività." />
          </div>
        )}
      </Modal>
    </>
  );
}
