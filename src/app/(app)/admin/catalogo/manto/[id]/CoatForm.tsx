"use client";

import { useState } from "react";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { saveCoat, deleteCoat } from "../../../actions";

type Prices = Record<"govListPrice" | "basePriceA" | "basePriceB" | "trainingPrice" | "salePriceA" | "salePriceB" | "governmentPrice", number | null>;
type Coat = {
  id?: number; breedId?: number; name?: string; description?: string | null; notes?: string | null; sortOrder?: number; archived?: boolean;
  image?: string | null; horses?: number; originalName?: string | null; prices?: Prices; stats?: Record<number, number | null>;
};

const PRICE_INPUTS: [keyof Prices, string, string][] = [
  ["salePriceA", "TOT 5-10 anni", "Prezzo di vendita fascia A"],
  ["salePriceB", "TOT 11-16 anni", "Prezzo di vendita fascia B"],
  ["governmentPrice", "Governo", "Vendita al blip del Governo"],
  ["govListPrice", "Listino Gov", "Acquisto al blip (informativo)"],
  ["basePriceA", "5-10 anni (base)", "Senza addestramento"],
  ["basePriceB", "11-15 anni (base)", "Senza addestramento"],
  ["trainingPrice", "Addestramento", ""],
];

export function CoatForm({ coat, breeds, stats }: { coat: Coat; breeds: { id: number; name: string }[]; stats: { id: number; label: string }[] }) {
  const [preview, setPreview] = useState<string | null>(coat.image ?? null);
  return (
    <>
      <ActionForm action={saveCoat} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {coat.id && <input type="hidden" name="id" value={coat.id} />}
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="field-label">Razza</span>
              <select name="breedId" defaultValue={coat.breedId ?? ""} className="input" required><option value="">—</option>{breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
            <label className="block"><span className="field-label">Nome manto</span><input name="name" defaultValue={coat.name} className="input" required maxLength={120} /></label>
          </div>
          {coat.originalName && coat.originalName !== coat.name && <p className="text-[13px] text-fg-3">Nome nel file Excel: {coat.originalName}</p>}
          <div>
            <h3 className="mb-2 text-[18px] text-fg">Prezzi</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PRICE_INPUTS.map(([k, label, hint]) => (
                <label key={k} className="block">
                  <span className="field-label">{label}</span>
                  <input name={k} type="number" step="0.01" min="0" defaultValue={coat.prices?.[k] ?? ""} className="input" />
                  {hint && <span className="mt-0.5 block text-[12.5px] text-fg-3">{hint}</span>}
                </label>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[18px] text-fg">Statistiche</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {stats.map((s) => (
                <label key={s.id} className="block"><span className="field-label">{s.label}</span><input name={`stat_${s.id}`} type="number" step="0.1" min="0" defaultValue={coat.stats?.[s.id] ?? ""} className="input" placeholder="—" /></label>
              ))}
            </div>
          </div>
          <label className="block"><span className="field-label">Descrizione</span><textarea name="description" defaultValue={coat.description ?? ""} className="input min-h-[90px]" /></label>
          <label className="block"><span className="field-label">Informazioni aggiuntive</span><textarea name="notes" defaultValue={coat.notes ?? ""} className="input min-h-[70px]" /></label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2"><span className="eyebrow">Ordine</span><input name="sortOrder" type="number" min="0" defaultValue={coat.sortOrder ?? 0} className="input !w-28" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="archived" defaultChecked={coat.archived} className="size-4" />Archiviato (nascosto da catalogo e moduli)</label>
          </div>
          <button className="btn btn-primary">Salva manto</button>
        </div>
        <div className="space-y-3">
          <span className="eyebrow block">Immagine</span>
          <div className="aspect-[4/3] overflow-hidden rounded-[3px] border border-border bg-surface-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-fg-3/60">Nessuna immagine</div>}
          </div>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="block w-full text-[14px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-fg"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
          {coat.image && <label className="flex items-center gap-2"><input type="checkbox" name="removeImage" className="size-4" />Rimuovi immagine attuale</label>}
          <p className="text-[12.5px] text-fg-3">JPG, PNG, WEBP o GIF, massimo 8 MB. La nuova immagine sostituisce la precedente.</p>
        </div>
      </ActionForm>
      {coat.id && (
        <div className="mt-6 border-t border-dashed border-border pt-4">
          {coat.horses ? (
            <p className="text-[14px] text-fg-3">{coat.horses} cavalli registrati con questo manto: per toglierlo dal catalogo usa &quot;Archiviato&quot;.</p>
          ) : (
            <ActionButton action={deleteCoat} fields={{ id: coat.id }} label="Elimina manto" className="btn btn-danger btn-sm" confirm="Eliminare definitivamente questo manto?" />
          )}
        </div>
      )}
    </>
  );
}
