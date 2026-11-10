"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { payWeek, unpayWeek, editWeek, payArrears, setUserPercent } from "./actions";
import { money } from "@/lib/format";

export function WeekActions({ userId, name, week, label, amount, computed, status, entryId, notes, overridden }: {
  userId: number; name: string; week: string; label: string; amount: number; computed: number; status: "PAGATO" | "DA_PAGARE"; entryId: number | null; notes: string | null; overridden: boolean;
}) {
  const [open, setOpen] = useState<null | "pay" | "edit" | "unpay">(null);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status === "DA_PAGARE" ? (
        <button className="btn btn-gold btn-sm" onClick={() => setOpen("pay")}>Paga</button>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen("unpay")}>Non pagato</button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen("edit")}>Modifica</button>

      <Modal open={open === "pay"} onClose={() => setOpen(null)} title={`Paga ${name}`}>
        <p className="mb-3">Settimana <b>{label}</b>. Importo calcolato: <b>{money(computed)}</b>{overridden ? ` (modificato: ${money(amount)})` : ""}.</p>
        <ActionForm action={payWeek} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="week" value={week} />
          <label className="block"><span className="label mb-1 block">Importo pagato</span><input name="amount" type="number" step="0.01" min="0" defaultValue={amount} className="input" required /></label>
          <label className="block"><span className="label mb-1 block">Note</span><textarea name="notes" defaultValue={notes ?? ""} className="input" /></label>
          <button className="btn btn-gold w-full">Registra come PAGATO</button>
        </ActionForm>
      </Modal>

      <Modal open={open === "edit"} onClose={() => setOpen(null)} title={`Modifica · ${label}`}>
        <ActionForm action={editWeek} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="week" value={week} />
          {status === "DA_PAGARE" ? (
            <label className="block">
              <span className="label mb-1 block">Importo (vuoto = calcolo automatico {money(computed)})</span>
              <input name="amount" type="number" step="0.01" min="0" defaultValue={overridden ? amount : ""} className="input" />
            </label>
          ) : (
            <p className="text-ink-soft italic">Settimana già pagata: puoi modificare solo le note. Per cambiare l&apos;importo segnala prima come non pagata.</p>
          )}
          <label className="block"><span className="label mb-1 block">Note</span><textarea name="notes" defaultValue={notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
      </Modal>

      <Modal open={open === "unpay"} onClose={() => setOpen(null)} title="Segna come NON PAGATO">
        <ActionForm action={unpayWeek} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="entryId" value={entryId ?? 0} />
          <p>Il pagamento di <b>{money(amount)}</b> per la settimana {label} resterà nello storico come annullato.</p>
          <label className="block"><span className="label mb-1 block">Motivo *</span><input name="notes" className="input" required minLength={3} /></label>
          <button className="btn btn-danger w-full">Conferma</button>
        </ActionForm>
      </Modal>
    </div>
  );
}

export function PayArrearsButton({ userId, name, count, total }: { userId: number; name: string; count: number; total: number }) {
  if (count === 0) return null;
  return (
    <ActionForm action={payArrears} confirm={`Registrare come PAGATE ${count} settimane arretrate di ${name} per un totale di ${money(total)}?`} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <button className="btn btn-gold btn-sm">Paga arretrati ({money(total)})</button>
    </ActionForm>
  );
}

export function PercentForm({ userId, percent, custom, globalPercent }: { userId: number; percent: number; custom: boolean; globalPercent: number }) {
  return (
    <ActionForm action={setUserPercent} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="block">
        <span className="label mb-1 block">Percentuale personale</span>
        <input name="percent" type="number" step="0.01" min="0" max="100" defaultValue={custom ? percent : ""} placeholder={`Globale: ${globalPercent}%`} className="input !w-44" />
      </label>
      <button className="btn btn-primary">Salva</button>
    </ActionForm>
  );
}
