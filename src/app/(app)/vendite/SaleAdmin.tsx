"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { ActionForm } from "@/components/ActionForm";
import { correctSale, voidSale } from "./actions";
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
            <label className="block"><span className="label mb-1 block">Prezzo finale</span><input name="finalPrice" type="number" step="0.01" min="0" defaultValue={sale.finalPrice} className="input" required /></label>
            <label className="block"><span className="label mb-1 block">Data e ora</span><input name="soldAt" type="datetime-local" defaultValue={formatInTimeZone(new Date(sale.soldAt), TZ, "yyyy-MM-dd'T'HH:mm")} className="input" required /></label>
            <label className="block sm:col-span-2"><span className="label mb-1 block">Venditore</span>
              <select name="sellerId" defaultValue={sale.sellerId} className="input">{sellers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
            </label>
            <label className="block sm:col-span-2"><span className="label mb-1 block">Acquirente</span><input name="buyerName" defaultValue={sale.buyerName ?? ""} className="input" /></label>
            <label className="block sm:col-span-2"><span className="label mb-1 block">Note</span><textarea name="notes" defaultValue={sale.notes ?? ""} className="input" /></label>
          </div>
          <button className="btn btn-primary">Salva correzione</button>
        </ActionForm>
        <div className="mt-6 border-t border-dashed border-[#bfa476] pt-4">
          <ActionForm action={voidSale} confirm="Annullare la vendita? Resterà nello storico come annullata." onSuccess={() => setOpen(false)} className="space-y-3">
            <input type="hidden" name="saleId" value={sale.id} />
            <label className="block"><span className="label mb-1 block">Annulla vendita – motivo</span><input name="reason" className="input" required minLength={3} /></label>
            {sale.type === "STALLA" && (
              <label className="flex items-center gap-2"><input type="checkbox" name="backToStable" defaultChecked className="size-4 accent-[#5a3a22]" />Riporta il cavallo in stalla</label>
            )}
            <button className="btn btn-danger">Annulla vendita</button>
          </ActionForm>
        </div>
      </Modal>
    </>
  );
}
