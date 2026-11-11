"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { ActionForm } from "@/components/ActionForm";
import { correctSale, voidSale } from "./actions";
import { voidItemSale } from "../bottega/actions";
import { TZ } from "@/lib/format";
import { Modal } from "@/components/Modal";

type Sale = { id: number; finalPrice: number; sellerId: number; buyerName: string | null; notes: string | null; soldAt: string; voided: boolean; type: "STALLA" | "GOVERNO" };

export function SaleAdmin({ sale, sellers }: { sale: Sale; sellers: { id: number; displayName: string }[] }) {
  const [open, setOpen] = useState(false);
  if (sale.voided) return null;
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Correggi</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Correzione vendita #${sale.id}`}>
        <ActionForm action={correctSale} onSuccess={() => setOpen(false)} className="space-y-3">
          <input type="hidden" name="saleId" value={sale.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="field-label">Prezzo finale</span><input name="finalPrice" type="number" step="0.01" min="0" defaultValue={sale.finalPrice} className="input" required /></label>
            <label className="block"><span className="field-label">Data e ora</span><input name="soldAt" type="datetime-local" defaultValue={formatInTimeZone(new Date(sale.soldAt), TZ, "yyyy-MM-dd'T'HH:mm")} className="input" required /></label>
          </div>
          <label className="block"><span className="field-label">Venditore</span>
            <select name="sellerId" defaultValue={sale.sellerId} className="input">{sellers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
          </label>
          <label className="block"><span className="field-label">Acquirente</span><input name="buyerName" defaultValue={sale.buyerName ?? ""} className="input" /></label>
          <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={sale.notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva correzione</button>
        </ActionForm>
        <ActionForm action={voidSale} confirm="Annullare la vendita? Resterà nello storico come annullata." onSuccess={() => setOpen(false)} className="mt-6 space-y-3 border-t border-border pt-4">
          <input type="hidden" name="saleId" value={sale.id} />
          <label className="block"><span className="field-label">Annulla vendita – motivo</span><input name="reason" className="input" required minLength={3} /></label>
          {sale.type === "STALLA" && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="backToStable" defaultChecked />Riporta il cavallo in stalla</label>}
          <button className="btn btn-secondary">Annulla vendita</button>
        </ActionForm>
      </Modal>
    </>
  );
}

export function ItemSaleAdmin({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Annulla</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Annulla vendita oggetti #${id}`}>
        <ActionForm action={voidItemSale} onSuccess={() => setOpen(false)} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <label className="block"><span className="field-label">Motivo</span><input name="reason" className="input" required minLength={3} /></label>
          <button className="btn btn-primary w-full">Annulla vendita</button>
        </ActionForm>
      </Modal>
    </>
  );
}
