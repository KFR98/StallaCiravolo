"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { money } from "@/lib/format";
import { sellItems, saveItem, deleteItem, saveSupplier, deleteSupplier, handleShopNote, handleReimbursement } from "./actions";

export type ShopItemRow = { id: number; kind: "VENDITA" | "MATERIA_PRIMA"; name: string; group: string | null; price: number | null; priceNote: string | null; notes: string | null };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Vendita oggetti: tocca un oggetto per aggiungerlo, regola le quantità, registra. */
export function ShopSell({ items }: { items: ShopItemRow[] }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [requestId, setRequestId] = useState("");
  useEffect(() => setRequestId(newId()), []);
  const sellable = items.filter((i) => i.price != null);
  const list = useMemo(() => sellable.filter((i) => !q || q.trim().split(/\s+/).every((t) => norm(`${i.name} ${i.group ?? ""}`).includes(norm(t)))), [sellable, q]);
  const groups = [...new Set(list.map((i) => i.group ?? "Altro"))];
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ item: items.find((i) => i.id === Number(id))!, quantity: n }));
  const total = lines.reduce((t, l) => t + (l.item.price ?? 0) * l.quantity, 0);
  const add = (id: number, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="card card-pad">
        <div className="relative mb-4">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca un oggetto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca oggetto" />
        </div>
        {groups.map((g) => (
          <section key={g} className="mb-4">
            <h3 className="eyebrow mb-2">{g}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.filter((i) => (i.group ?? "Altro") === g).map((i) => (
                <button key={i.id} type="button" onClick={() => add(i.id, 1)}
                  className={clsx("flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 text-left transition-colors", cart[i.id] ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
                  <span className="font-medium">{i.name}</span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    {cart[i.id] ? <span className="badge badge-solid-accent">×{cart[i.id]}</span> : null}
                    <b>{money(i.price)}</b>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {list.length === 0 && <p className="text-fg-3">Nessun oggetto trovato.</p>}
      </div>
      <div className="card card-pad h-fit lg:sticky lg:top-6">
        <h3 className="h-display mb-3 text-[18px]">Vendita</h3>
        {lines.length === 0 ? <p className="text-fg-3">Tocca gli oggetti per aggiungerli.</p> : (
          <ul className="mb-3 divide-y divide-border">
            {lines.map(({ item, quantity }) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Togli un ${item.name}`} onClick={() => add(item.id, -1)}><Minus size={15} /></button>
                <input aria-label={`Quantità ${item.name}`} className="input !min-h-8 !w-14 !px-1 text-center" inputMode="numeric" value={quantity}
                  onChange={(e) => setCart((c) => ({ ...c, [item.id]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) }))} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Aggiungi un ${item.name}`} onClick={() => add(item.id, 1)}><Plus size={15} /></button>
                <b className="w-16 text-right tabular-nums">{money((item.price ?? 0) * quantity)}</b>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={sellItems} onSuccess={() => { setCart({}); setRequestId(newId()); }} className="space-y-3" confirm={() => `Registrare la vendita per ${money(total)}?`}>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })))} />
          <input name="buyerName" className="input" placeholder="Acquirente (facoltativo)" maxLength={120} />
          <div className="flex items-center justify-between rounded-lg bg-surface-3 px-3 py-2.5"><span className="font-semibold">Totale</span><span className="text-[22px] font-bold tabular-nums">{money(total)}</span></div>
          <button className="btn btn-primary w-full" disabled={!lines.length || !requestId}>Registra vendita</button>
        </ActionForm>
      </div>
    </div>
  );
}

/** Tabella articoli con ricerca e (per la direzione) modifica. */
export function ItemTable({ items, kind, canManage }: { items: ShopItemRow[]; kind: "VENDITA" | "MATERIA_PRIMA"; canManage: boolean }) {
  const [q, setQ] = useState("");
  const list = items.filter((i) => !q || norm(`${i.name} ${i.group ?? ""}`).includes(norm(q)));
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
        </div>
        {canManage && <ItemEdit kind={kind} label="+ Aggiungi" className="btn btn-primary" />}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="!pl-5">{kind === "VENDITA" ? "Oggetto" : "Materia prima / oggetto"}</th><th>Gruppo</th><th className="num">{kind === "VENDITA" ? "Prezzo di vendita" : "Prezzo di acquisto"}</th><th>Note</th>{canManage && <th className="!pr-5" />}</tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td className="!pl-5 font-semibold">{i.name}</td>
                <td className="text-fg-2">{i.group ?? "—"}</td>
                <td className="num font-semibold">{i.price != null ? money(i.price) : <span className="text-fg-3">—</span>}</td>
                <td className="max-w-[320px] text-[13.5px] text-fg-2">{[i.priceNote, i.notes].filter(Boolean).join(" · ")}</td>
                {canManage && <td className="!pr-5 text-right"><ItemEdit kind={kind} item={i} label="Modifica" className="btn btn-ghost btn-sm" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemEdit({ item, kind, label, className }: { item?: ShopItemRow; kind: "VENDITA" | "MATERIA_PRIMA"; label: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={item ? item.name : kind === "VENDITA" ? "Nuovo oggetto in vendita" : "Nuova materia prima"}>
        <ActionForm action={saveItem} onSuccess={() => setOpen(false)} className="space-y-3">
          {item && <input type="hidden" name="id" value={item.id} />}
          <input type="hidden" name="kind" value={kind} />
          <label className="block"><span className="field-label">Nome</span><input name="name" defaultValue={item?.name} className="input" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="field-label">Gruppo</span><input name="group" defaultValue={item?.group ?? ""} className="input" placeholder="Es. Cavalli" /></label>
            <label className="block"><span className="field-label">Prezzo $</span><input name="price" type="number" step="0.01" min="0" defaultValue={item?.price ?? ""} className="input" /></label>
          </div>
          <label className="block"><span className="field-label">Nota sul prezzo</span><input name="priceNote" defaultValue={item?.priceNote ?? ""} className="input" placeholder="Es. 5 Fenix" /></label>
          <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={item?.notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
        {item && (
          <div className="mt-4 border-t border-border pt-3 text-right">
            <ActionButton action={deleteItem} fields={{ id: item.id }} label={<><Trash2 size={15} /> Elimina</>} className="btn btn-ghost btn-sm" confirm={`Eliminare ${item.name}?`} />
          </div>
        )}
      </Modal>
    </>
  );
}

export type SupplierRow = { id: number; name: string; activity: string | null; goods: string | null; missiva: string | null; starred: boolean; notes: string | null };

export function SupplierTable({ suppliers, canManage }: { suppliers: SupplierRow[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const list = suppliers.filter((s) => !q || norm(`${s.name} ${s.activity ?? ""} ${s.goods ?? ""} ${s.missiva ?? ""}`).includes(norm(q)));
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca fornitore, attività, merce, missiva…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca fornitore" />
        </div>
        {canManage && <SupplierEdit label="+ Aggiungi fornitore" className="btn btn-primary" />}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="!pl-5">Fornitore</th><th>Attività</th><th>Merce</th><th>Missiva</th><th>Note</th>{canManage && <th className="!pr-5" />}</tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td className="!pl-5 font-semibold">{s.starred && <Star size={14} className="mr-1 inline fill-warn-strong text-warn-strong" aria-label="Contrassegnato" />}{s.name}</td>
                <td>{s.activity ?? "—"}</td>
                <td className="text-fg-2">{s.goods ?? "—"}</td>
                <td className="font-mono">{s.missiva ?? "—"}</td>
                <td className="max-w-[260px] text-[13.5px] text-fg-2">{s.notes}</td>
                {canManage && <td className="!pr-5 text-right"><SupplierEdit supplier={s} label="Modifica" className="btn btn-ghost btn-sm" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[12.5px] text-fg-3"><Star size={12} className="inline fill-warn-strong text-warn-strong" /> = contrassegnato con * nel file originale.</p>
    </div>
  );
}

function SupplierEdit({ supplier, label, className }: { supplier?: SupplierRow; label: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={supplier ? supplier.name : "Nuovo fornitore"}>
        <ActionForm action={saveSupplier} onSuccess={() => setOpen(false)} className="space-y-3">
          {supplier && <input type="hidden" name="id" value={supplier.id} />}
          <label className="block"><span className="field-label">Nome / referente</span><input name="name" defaultValue={supplier?.name} className="input" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="field-label">Attività</span><input name="activity" defaultValue={supplier?.activity ?? ""} className="input" /></label>
            <label className="block"><span className="field-label">Missiva</span><input name="missiva" defaultValue={supplier?.missiva ?? ""} className="input uppercase" /></label>
          </div>
          <label className="block"><span className="field-label">Merce</span><input name="goods" defaultValue={supplier?.goods ?? ""} className="input" /></label>
          <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={supplier?.notes ?? ""} className="input" /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="starred" defaultChecked={supplier?.starred} /> Contrassegnato</label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
        {supplier && (
          <div className="mt-4 border-t border-border pt-3 text-right">
            <ActionButton action={deleteSupplier} fields={{ id: supplier.id }} label={<><Trash2 size={15} /> Elimina</>} className="btn btn-ghost btn-sm" confirm={`Eliminare ${supplier.name}?`} />
          </div>
        )}
      </Modal>
    </>
  );
}

export function HandleButton({ kind, id, statuses, current, response }: { kind: "nota" | "rimborso"; id: number; statuses: [string, string][]; current: string; response: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Gestisci</button>
      <Modal open={open} onClose={() => setOpen(false)} title={kind === "nota" ? "Gestisci proposta" : "Gestisci rimborso"}>
        <ActionForm action={kind === "nota" ? handleShopNote : handleReimbursement} onSuccess={() => setOpen(false)} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <label className="block"><span className="field-label">Stato</span>
            <select name="status" defaultValue={current} className="input">{statuses.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="block"><span className="field-label">Risposta</span><textarea name="response" defaultValue={response ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
      </Modal>
    </>
  );
}
