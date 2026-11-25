"use client";

import { useState } from "react";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { saveCustomer, mergeCustomers, deleteCustomer } from "./actions";

type C = { id: number; name: string; missiva: string | null; contact: string | null; notes: string | null };

export function CustomerButton({ customer, label, className }: { customer?: C; label: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={customer ? customer.name : "Nuovo cliente"}>
        <ActionForm action={saveCustomer} onSuccess={() => setOpen(false)} className="space-y-3">
          {customer && <input type="hidden" name="id" value={customer.id} />}
          <label className="block"><span className="field-label">Nome</span><input name="name" defaultValue={customer?.name} className="input" required minLength={2} maxLength={120} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="field-label">Missiva</span><input name="missiva" defaultValue={customer?.missiva ?? ""} className="input uppercase" maxLength={40} /></label>
            <label className="block"><span className="field-label">Altro contatto</span><input name="contact" defaultValue={customer?.contact ?? ""} className="input" maxLength={200} placeholder="Es. Discord" /></label>
          </div>
          <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={customer?.notes ?? ""} className="input" maxLength={2000} /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
      </Modal>
    </>
  );
}

export function ManageCustomer({ customer, others }: { customer: C; others: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>Unisci o elimina…</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Gestisci ${customer.name}`}>
        <ActionForm action={mergeCustomers} className="space-y-3" confirm={() => `Unire ${customer.name} nell'altro cliente? Acquisti e prenotazioni passano a lui e questa scheda sparisce.`}>
          <input type="hidden" name="id" value={customer.id} />
          <p className="text-[14px] text-fg-2">È la stessa persona scritta in due modi? Unisci le schede: tutti gli acquisti finiscono in quella scelta.</p>
          <select name="into" className="input" required defaultValue="">
            <option value="" disabled>Unisci con…</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="btn btn-secondary w-full">Unisci</button>
        </ActionForm>
        <div className="mt-5 border-t border-border pt-4">
          <ActionButton action={deleteCustomer} fields={{ id: customer.id }} label="Elimina la scheda (le vendite restano)" className="btn btn-ghost btn-sm !text-accent-text" confirm={`Eliminare la scheda di ${customer.name}? Le vendite restano nello storico con il suo nome.`} />
        </div>
      </Modal>
    </>
  );
}
