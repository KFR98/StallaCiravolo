"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Scale, Undo2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { money } from "@/lib/format";
import { cashMove, voidCashMove } from "./actions";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
type Kind = "PRELIEVO" | "VERSAMENTO" | "RETTIFICA";
const TITLE: Record<Kind, string> = { PRELIEVO: "Preleva dalla cassa", VERSAMENTO: "Versa in cassa", RETTIFICA: "Allinea al contante reale" };

/** Pulsanti Preleva / Versa / Allinea (solo con il permesso "cash.manage"; il server lo ricontrolla). */
export function CashActions({ balance }: { balance: number }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [requestId, setRequestId] = useState("");
  const [amount, setAmount] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => { if (open) { setRequestId(newId()); setAmount(""); setAll(false); } }, [open]);
  const n = Number(amount.replace(",", "."));

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => setOpen("PRELIEVO")} disabled={balance <= 0}><ArrowUpFromLine size={17} /> Preleva</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen("VERSAMENTO")}><ArrowDownToLine size={17} /> Versa</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen("RETTIFICA")}><Scale size={17} /> Allinea</button>
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? TITLE[open] : ""}>
        {open && (
          <ActionForm
            action={cashMove}
            onSuccess={() => setOpen(null)}
            className="space-y-3"
            confirm={() =>
              open === "PRELIEVO" ? `Prelevare ${all ? `TUTTO (${money(balance)})` : money(n)} dalla cassa?`
              : open === "RETTIFICA" ? `La cassa passerà da ${money(balance)} a ${money(n)} (differenza ${money(n - balance)}). Confermi?`
              : null
            }
          >
            <input type="hidden" name="kind" value={open} />
            <input type="hidden" name="requestId" value={requestId} />
            <p className="text-[14px] text-fg-2">
              In cassa ora: <b className="text-fg">{money(balance)}</b>.
              {open === "RETTIFICA" && " Conta il contante che c'è davvero e scrivilo qui: verrà registrata la differenza (es. ammanchi o soldi trovati)."}
            </p>
            {open === "PRELIEVO" && (
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="all" checked={all} onChange={(e) => setAll(e.target.checked)} /> Preleva tutto ({money(balance)})</label>
            )}
            {!all && (
              <label className="block">
                <span className="field-label">{open === "RETTIFICA" ? "Contante reale in cassa ($)" : "Importo ($)"}</span>
                <input name="amount" className="input text-[18px] font-bold tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
              </label>
            )}
            {open === "PRELIEVO" && !all && n > balance && <p className="text-[13px] font-semibold text-accent-text">Più di quanto c&apos;è in cassa.</p>}
            <label className="block">
              <span className="field-label">Motivo</span>
              <input name="reason" className="input" required minLength={3} maxLength={200} placeholder={open === "PRELIEVO" ? "Es. Acquisto fieno, quota proprietario…" : open === "VERSAMENTO" ? "Es. Fondo cassa iniziale" : "Es. Conteggio di fine settimana"} />
            </label>
            <button className="btn btn-primary w-full" disabled={!all && !(n >= 0 && amount.trim() !== "") || (open === "PRELIEVO" && !all && (n <= 0 || n > balance))}>
              {open === "PRELIEVO" ? "Preleva" : open === "VERSAMENTO" ? "Versa" : "Allinea"}
            </button>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}

export function VoidMove({ id, label }: { id: number; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(true)} aria-label={`Annulla ${label}`} title="Annulla"><Undo2 size={16} /></button>
      <Modal open={open} onClose={() => setOpen(false)} title="Annulla movimento">
        <ActionForm action={voidCashMove} onSuccess={() => setOpen(false)} className="space-y-3" confirm={`Annullare ${label}? Resta nello storico, barrato.`}>
          <input type="hidden" name="id" value={id} />
          <p className="text-[14px] text-fg-2">{label}</p>
          <label className="block"><span className="field-label">Motivo</span><input name="reason" className="input" required minLength={3} maxLength={200} /></label>
          <button className="btn btn-danger w-full">Annulla movimento</button>
        </ActionForm>
      </Modal>
    </>
  );
}
