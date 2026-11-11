"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { saveBreed, deleteBreed, saveStats, deleteStat } from "../actions";

type Breed = { id: number; name: string; description: string | null; isCustom: boolean; sortOrder: number; archived: boolean; horses: number };

export function BreedButton({ breed, label, className = "btn btn-secondary btn-sm" }: { breed?: Breed; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={breed ? `Razza: ${breed.name}` : "Nuova razza"}>
        <ActionForm action={saveBreed} onSuccess={() => setOpen(false)} className="space-y-3">
          {breed && <input type="hidden" name="id" value={breed.id} />}
          <label className="block"><span className="field-label">Nome</span><input name="name" defaultValue={breed?.name} className="input" required /></label>
          <label className="block"><span className="field-label">Descrizione</span><textarea name="description" defaultValue={breed?.description ?? ""} className="input min-h-[90px]" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="field-label">Ordine</span><input name="sortOrder" type="number" min="0" defaultValue={breed?.sortOrder ?? 0} className="input" /></label>
            <div className="space-y-1 pt-5">
              <label className="flex items-center gap-2"><input type="checkbox" name="isCustom" defaultChecked={breed?.isCustom} className="size-4" />Razza mod/personalizzata</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="archived" defaultChecked={breed?.archived} className="size-4" />Archiviata (nascosta)</label>
            </div>
          </div>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
        {breed && (
          <div className="mt-4 border-t border-dashed border-border pt-3">
            {breed.horses > 0 ? (
              <p className="text-[14px] text-fg-3">Ci sono {breed.horses} cavalli registrati con questa razza: si può solo archiviare.</p>
            ) : (
              <ActionButton action={deleteBreed} fields={{ id: breed.id }} label="Elimina razza e manti" className="btn btn-danger btn-sm" confirm={`Eliminare definitivamente ${breed.name} e tutti i suoi manti?`} />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export function StatsEditor({ stats }: { stats: { id: number; label: string; max: number; filled: number; total: number }[] }) {
  const [order, setOrder] = useState(stats.map((s) => s.id));
  const move = (id: number, d: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const byId = new Map(stats.map((s) => [s.id, s]));
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-fg-2">
        Sono le statistiche mostrate nelle schede dei cavalli (catalogo, confronto, stalla). Qui puoi <b>rinominarle</b>
        (es. “VELOC.” → “Velocità”), <b>cambiarne l&apos;ordine</b> con le frecce, <b>aggiungerne</b> di nuove o eliminarle.
        I valori di ogni cavallo si inseriscono nella scheda del manto. La barra piena corrisponde al valore più alto presente nel catalogo.
      </p>
      <ActionForm action={saveStats} className="space-y-3">
        {order.map((id, idx) => <input key={id} type="hidden" name={`order_${id}`} value={idx} />)}
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Ordine</th><th>Nome mostrato</th><th className="num">Massimo nel catalogo</th><th className="num">Manti compilati</th><th /></tr></thead>
            <tbody>
              {order.map((id, idx) => {
                const s = byId.get(id)!;
                return (
                  <tr key={id}>
                    <td className="whitespace-nowrap">
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(id, -1)} disabled={idx === 0} aria-label={`Sposta su ${s.label}`}>↑</button>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(id, 1)} disabled={idx === order.length - 1} aria-label={`Sposta giù ${s.label}`}>↓</button>
                    </td>
                    <td><input name={`label_${id}`} defaultValue={s.label} className="input !min-h-9 !py-1" required maxLength={60} aria-label="Nome della statistica" /></td>
                    <td className="num font-semibold">{s.max || "—"}</td>
                    <td className="num">{s.filled}/{s.total}</td>
                    <td className="text-right"><DeleteStatButton id={id} label={s.label} filled={s.filled} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1"><span className="field-label">Aggiungi una statistica (facoltativo)</span><input name="newLabel" className="input" placeholder="Es. Coraggio" maxLength={60} /></label>
          <button className="btn btn-primary">Salva statistiche</button>
        </div>
      </ActionForm>
    </div>
  );
}

/** Pulsante senza <form>: si trova dentro il modulo delle statistiche e i moduli non si possono annidare. */
function DeleteStatButton({ id, label, filled }: { id: number; label: string; filled: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Eliminare la statistica "${label}"?${filled ? ` Verranno cancellati anche i valori di ${filled} manti.` : ""}`)) return;
        const fd = new FormData();
        fd.set("id", String(id));
        start(async () => {
          const r = await deleteStat(fd);
          if (r.ok) { toast.success(r.message ?? "Eliminata."); router.refresh(); } else toast.error(r.error ?? "Errore.");
        });
      }}
    >
      Elimina
    </button>
  );
}
