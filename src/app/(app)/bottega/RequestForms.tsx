"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { createShopNote, createReimbursement } from "./actions";

export function NoteForm() {
  return (
    <ActionForm action={createShopNote} resetOnSuccess className="space-y-3">
      <label className="block"><span className="field-label">Tipo</span>
        <select name="type" className="input" defaultValue="NUOVO_FORNITORE">
          <option value="NUOVO_FORNITORE">Proposta nuovo fornitore</option>
          <option value="MODIFICA_PROPOSTA">Modifica proposta (prezzi, oggetti…)</option>
          <option value="NOTA">Nota generica</option>
        </select>
      </label>
      <label className="block"><span className="field-label">Dettagli</span><textarea name="text" className="input" required minLength={3} placeholder="Es. Fabbro di Strawberry vende lingotti a 2$, missiva AB123" /></label>
      <button className="btn btn-secondary w-full">Invia proposta</button>
    </ActionForm>
  );
}

export function ReimbursementForm({ suppliers }: { suppliers: { id: number; name: string; activity: string | null }[] }) {
  const [other, setOther] = useState(true);
  return (
    <ActionForm action={createReimbursement} resetOnSuccess onSuccess={() => setOther(true)} className="space-y-3">
      <label className="block"><span className="field-label">Fornitore</span>
        <select name="supplierId" className="input" defaultValue="" onChange={(e) => setOther(e.target.value === "")}>
          <option value="">Altro (scrivi sotto)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.activity ? ` · ${s.activity}` : ""}</option>)}
        </select>
      </label>
      {other && <input name="supplierName" className="input" placeholder="Nome del fornitore" required />}
      <label className="block"><span className="field-label">Merce acquistata</span><input name="description" className="input" required placeholder="Es. 20 lingotti di ferro" /></label>
      <label className="block"><span className="field-label">Importo da rimborsare $</span><input name="amount" type="number" step="0.01" min="0.01" className="input" required /></label>
      <button className="btn btn-secondary w-full">Chiedi rimborso</button>
    </ActionForm>
  );
}
