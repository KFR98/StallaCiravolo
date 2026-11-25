"use client";

import { useState } from "react";
import { Lock, Printer } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { money } from "@/lib/format";
import { closeCash } from "./actions";

/** "Chiudi cassa": riepilogo del periodo, contante contato (facoltativo) e allineamento. */
export function CloseCashButton({ preview, canAlign }: { preview: { from: string | null; income: number; outgo: number; closing: number; movements: number }; canAlign: boolean }) {
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const n = counted.trim() === "" ? null : Number(counted.replace(",", "."));
  const diff = n != null && Number.isFinite(n) ? Math.round((n - preview.closing) * 100) / 100 : null;
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><Lock size={16} /> Chiudi cassa</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Chiusura di cassa">
        <ActionForm action={closeCash} onSuccess={() => setOpen(false)} className="space-y-3" confirm="Registrare la chiusura? Resta nello storico e non si può modificare.">
          <p className="text-[14px] text-fg-2">
            Fotografa entrate e uscite {preview.from ? <>dall&apos;ultima chiusura ({new Date(preview.from).toLocaleString("it-IT")})</> : "dall'inizio"} a adesso.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-[14px]">
            <dt className="text-fg-3">Entrate</dt><dd className="text-right font-semibold text-ok tabular-nums">+{money(preview.income)}</dd>
            <dt className="text-fg-3">Uscite</dt><dd className="text-right font-semibold text-accent-text tabular-nums">−{money(Math.abs(preview.outgo))}</dd>
            <dt className="text-fg-3">Movimenti</dt><dd className="text-right tabular-nums">{preview.movements}</dd>
            <dt className="font-semibold">Dovrebbero esserci</dt><dd className="text-right text-[18px] font-bold tabular-nums">{money(preview.closing)}</dd>
          </dl>
          <label className="block">
            <span className="field-label">Contante contato davvero (facoltativo)</span>
            <input name="counted" className="input text-[18px] font-bold tabular-nums" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={String(preview.closing)} />
          </label>
          {diff != null && (
            <p className={`text-[14px] font-semibold ${Math.abs(diff) < 0.005 ? "text-ok" : "text-accent-text"}`}>
              {Math.abs(diff) < 0.005 ? "Torna al centesimo." : diff > 0 ? `Ci sono ${money(diff)} in più.` : `Mancano ${money(-diff)}.`}
            </p>
          )}
          {canAlign && diff != null && Math.abs(diff) >= 0.005 && (
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="align" defaultChecked /> Allinea la cassa al contante contato (registra la differenza)</label>
          )}
          <label className="block"><span className="field-label">Note</span><input name="notes" className="input" maxLength={1000} placeholder="Es. chiusura di fine settimana" /></label>
          <button className="btn btn-primary w-full">Registra la chiusura</button>
        </ActionForm>
      </Modal>
    </>
  );
}

export function PrintButton() {
  return <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()}><Printer size={16} /> Stampa</button>;
}
