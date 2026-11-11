"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { payUser, payWeek, unpayWeek, editWeek, setUserPercents } from "./actions";
import { money } from "@/lib/format";

/** Pulsante "Paga" accanto all'utente: un click, importo già compilato e modificabile. */
export function PayButton({ userId, name, due, weeks, currentDue = 0, className = "btn btn-primary btn-sm" }: { userId: number; name: string; due: number; weeks: string[]; currentDue?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(due || ""));
  const diff = (Number(amount) || 0) - due;
  return (
    <>
      <button className={className} onClick={() => { setAmount(String(due || "")); setOpen(true); }}>Paga</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Paga ${name}`}>
        <ActionForm action={payUser} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="rounded-lg bg-surface-2 p-3 text-[14.5px]">
            <div className="flex justify-between"><span className="text-fg-3">Gli spetta</span><b className="text-[18px]">{money(due)}</b></div>
            {weeks.length > 0 ? <div className="mt-1 text-[13px] text-fg-3">Settimane arretrate: {weeks.join(", ")}</div> : <div className="mt-1 text-[13px] text-fg-3">Nessun arretrato: il pagamento sarà registrato sull&apos;ultima settimana (settimana in corso: {money(currentDue)} maturati finora).</div>}
          </div>
          <label className="block">
            <span className="field-label">Importo pagato</span>
            <input name="amount" type="number" step="0.01" min="0.01" className="input text-[18px] font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </label>
          {amount !== "" && Math.abs(diff) > 0.004 && (
            <p className={`text-[14px] font-semibold ${diff > 0 ? "text-ok" : "text-warn"}`}>
              {diff > 0 ? `+${money(diff)} in più del dovuto (incentivo)` : `Restano ${money(-diff)} da saldare`}
            </p>
          )}
          <label className="block"><span className="field-label">Nota</span><input name="notes" className="input" placeholder="Es. bonus per le catture" maxLength={500} /></label>
          <button className="btn btn-primary w-full">Registra pagamento</button>
        </ActionForm>
      </Modal>
    </>
  );
}

export function WeekMenu({ userId, week, label, due, residual, computed, overridden, notes, entryId, paid }: {
  userId: number; week: string; label: string; due: number; residual: number; computed: number; overridden: boolean; notes: string | null; entryId: number | null; paid: number;
}) {
  const [open, setOpen] = useState<null | "menu" | "pay" | "edit" | "unpay">(null);
  return (
    <>
      <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Azioni settimana ${label}`} onClick={() => setOpen("menu")}><MoreHorizontal size={18} /></button>
      <Modal open={open === "menu"} onClose={() => setOpen(null)} title={`Settimana ${label}`}>
        <div className="grid gap-2">
          <button className="btn btn-primary" onClick={() => setOpen("pay")}>Registra pagamento</button>
          <button className="btn btn-secondary" onClick={() => setOpen("edit")}>Modifica dovuto o note</button>
          {paid > 0 && entryId && <button className="btn btn-ghost" onClick={() => setOpen("unpay")}>Annulla pagamento</button>}
        </div>
      </Modal>
      <Modal open={open === "pay"} onClose={() => setOpen(null)} title={`Pagamento · ${label}`}>
        <ActionForm action={payWeek} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="week" value={week} />
          <p>Spetta <b>{money(due)}</b>, già pagato <b>{money(paid)}</b>.</p>
          <label className="block"><span className="field-label">Importo</span><input name="amount" type="number" step="0.01" min="0.01" defaultValue={residual || ""} className="input" required /></label>
          <label className="block"><span className="field-label">Nota</span><input name="notes" defaultValue={notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Registra</button>
        </ActionForm>
      </Modal>
      <Modal open={open === "edit"} onClose={() => setOpen(null)} title={`Modifica · ${label}`}>
        <ActionForm action={editWeek} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="week" value={week} />
          <label className="block"><span className="field-label">Dovuto (vuoto = calcolo automatico {money(computed)})</span><input name="amount" type="number" step="0.01" min="0" defaultValue={overridden ? due : ""} className="input" /></label>
          <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
      </Modal>
      <Modal open={open === "unpay"} onClose={() => setOpen(null)} title="Annulla pagamento">
        <ActionForm action={unpayWeek} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="entryId" value={entryId ?? 0} />
          <p>Il pagamento di {money(paid)} resterà nello storico come annullato.</p>
          <label className="block"><span className="field-label">Motivo *</span><input name="notes" className="input" required minLength={3} /></label>
          <button className="btn btn-primary w-full">Conferma</button>
        </ActionForm>
      </Modal>
    </>
  );
}

export function PercentForm({ userId, values, globals }: { userId: number; values: { stable: string; gov: string; items: string }; globals: { stable: number; gov: number; items: number } }) {
  return (
    <ActionForm action={setUserPercents} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid grid-cols-3 gap-2">
        <label className="block"><span className="field-label">Stalla %</span><input name="pctStable" type="number" step="0.01" min="0" max="100" defaultValue={values.stable} placeholder={`${globals.stable}`} className="input" /></label>
        <label className="block"><span className="field-label">Blip %</span><input name="pctGov" type="number" step="0.01" min="0" max="100" defaultValue={values.gov} placeholder={`${globals.gov}`} className="input" /></label>
        <label className="block"><span className="field-label">Oggetti %</span><input name="pctItems" type="number" step="0.01" min="0" max="100" defaultValue={values.items} placeholder={`${globals.items}`} className="input" /></label>
      </div>
      <p className="text-[12.5px] text-fg-3">Campo vuoto = percentuale globale (mostrata in grigio).</p>
      <button className="btn btn-secondary">Salva percentuali</button>
    </ActionForm>
  );
}
