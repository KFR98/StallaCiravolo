"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, Star, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { money } from "@/lib/format";
import { SaleTag } from "@/components/SaleTag";
import { HorseThumb } from "@/components/ui";
import { HorsePicker, buildHorseOptions, type HorseOption } from "@/components/HorsePicker";
import { sellItems, saveItem, deleteItem, saveSupplier, deleteSupplier, handleShopNote, handleReimbursement } from "./actions";

export type ShopItemRow = { id: number; kind: "VENDITA" | "MATERIA_PRIMA"; name: string; group: string | null; subgroup: string | null; price: number | null; priceNote: string | null; notes: string | null };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const byName = (a: string, b: string) => a.localeCompare(b, "it", { sensitivity: "base", numeric: true });

export type TrainingBreed = { id: number; name: string; coats: { id: number; name: string; image: string | null; trainingPrice: number | null }[] };
/** Cavallo in stalla non ancora addestrato, con il prezzo dell'addestramento già calcolato dal server */
export type StableHorse = {
  id: number; breedId: number; coatId: number; breed: string; coat: string; plate: string | null; image: string | null;
  rarity: "RARO" | "LEGGENDARIO" | null; owner: string; price: number | null;
};
type TrainingLine = { key: string; coatId: number; horseId: number | null; label: string; image: string | null; rarity: "RARO" | "LEGGENDARIO" | null; plate: string; price: number };

/**
 * Fattura della bottega: addestramenti di cavalli + oggetti in vetrina, un unico totale.
 * I prezzi mostrati sono solo un'anteprima: il server li ricalcola dal listino.
 */
export function ShopSell({ items, breeds, stable, rareTrainingPrice, maxDiscount, canFlat, canOverride }: {
  items: ShopItemRow[]; breeds: TrainingBreed[]; stable: StableHorse[]; rareTrainingPrice: number; maxDiscount: number; canFlat: boolean; canOverride: boolean;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [trainings, setTrainings] = useState<TrainingLine[]>([]);
  const [flatOn, setFlatOn] = useState(false);
  const [flat, setFlat] = useState("");
  const [requestId, setRequestId] = useState("");
  useEffect(() => setRequestId(newId()), []);
  const sellable = useMemo(() => items.filter((i) => i.price != null).sort((a, b) => byName(a.name, b.name)), [items]);
  // gruppi (pulsanti in alto) e, dentro, sottogruppi in ordine alfabetico; gli oggetti senza sottogruppo vanno in fondo
  const allGroups = useMemo(() => [...new Set(sellable.map((i) => i.group ?? "Altro"))].sort(byName), [sellable]);
  const list = useMemo(
    () => sellable.filter((i) => (!group || (i.group ?? "Altro") === group) && (!q || q.trim().split(/\s+/).every((t) => norm(`${i.name} ${i.group ?? ""} ${i.subgroup ?? ""}`).includes(norm(t))))),
    [sellable, q, group],
  );
  const sections = useMemo(() => {
    const m = new Map<string, ShopItemRow[]>();
    for (const i of list) {
      const k = `${i.group ?? "Altro"}${i.subgroup ? ` · ${i.subgroup}` : ""}`;
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m].sort(([a, ia], [b, ib]) => byName(ia[0].group ?? "Altro", ib[0].group ?? "Altro") || Number(!ia[0].subgroup) - Number(!ib[0].subgroup) || byName(a, b));
  }, [list]);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ item: items.find((i) => i.id === Number(id))!, quantity: n }));
  const itemsTotal = lines.reduce((t, l) => t + (l.item.price ?? 0) * l.quantity, 0);
  const trainingTotal = trainings.reduce((t, l) => t + l.price, 0);
  const listTotal = Math.round((itemsTotal + trainingTotal) * 100) / 100;
  const flatNum = flat.trim() === "" ? null : Number(flat.replace(",", "."));
  const total = flatOn && flatNum != null && Number.isFinite(flatNum) ? flatNum : listTotal;
  const discountPct = flatOn && listTotal > 0 ? ((listTotal - total) / listTotal) * 100 : 0;
  const tooMuch = discountPct > maxDiscount + 1e-9 && !canOverride;
  const add = (id: number, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));
  const empty = !lines.length && !trainings.length;
  const reset = () => { setCart({}); setTrainings([]); setFlatOn(false); setFlat(""); };

  const payload = [
    ...trainings.map((t) => ({ type: "training", coatId: t.coatId, horseId: t.horseId, rarity: t.rarity, plate: t.plate.trim() || null })),
    ...lines.map((l) => ({ type: "item", itemId: l.item.id, quantity: l.quantity })),
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        <TrainingPicker breeds={breeds} stable={stable} rareTrainingPrice={rareTrainingPrice} inCart={trainings.map((t) => t.horseId).filter((x): x is number => x != null)} onAdd={(t) => setTrainings((x) => [...x, t])} />
        <div className="card card-pad">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><SaleTag kind="vetrina" /> Oggetti in vetrina</h3>
          <div className="relative mb-3">
            <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input className="input !pl-9" placeholder="Cerca un oggetto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca oggetto" />
          </div>
          {allGroups.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Gruppo di oggetti">
              {[["", `Tutti (${sellable.length})`], ...allGroups.map((g) => [g, `${g} (${sellable.filter((i) => (i.group ?? "Altro") === g).length})`])].map(([k, l]) => (
                <button key={k} type="button" className="chip" aria-pressed={group === k} onClick={() => setGroup(k)}>{l}</button>
              ))}
            </div>
          )}
          {sections.map(([title, rows]) => (
            <section key={title} className="mb-4">
              <h4 className="eyebrow mb-2">{title}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map((i) => (
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
      </div>

      <div className="card card-pad h-fit lg:sticky lg:top-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="h-display text-[18px]">Fattura</h3>
          {!empty && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset} aria-label="Svuota la fattura">
              <Trash2 size={15} /> Svuota
            </button>
          )}
        </div>
        {empty ? <p className="text-fg-3">Aggiungi un addestramento o tocca gli oggetti per metterli in fattura.</p> : (
          <ul className="mb-3 divide-y divide-border">
            {trainings.map((t) => (
              <li key={t.key} className="flex items-center gap-2 py-2">
                <span className="relative shrink-0">
                  <HorseThumb src={t.image} size={36} />
                  <span className="absolute -right-1 -bottom-1"><SaleTag kind="addestramento" short /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{t.label}</span>
                  {(t.rarity || t.plate) && <span className="block text-[12.5px] text-fg-3">{[t.rarity === "RARO" ? "Raro" : t.rarity === "LEGGENDARIO" ? "Leggendario" : null, t.plate && `Targa ${t.plate}`].filter(Boolean).join(" · ")}</span>}
                </span>
                <b className="w-16 text-right tabular-nums">{money(t.price)}</b>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Togli ${t.label}`} onClick={() => setTrainings((x) => x.filter((y) => y.key !== t.key))}><X size={15} /></button>
              </li>
            ))}
            {lines.map(({ item, quantity }) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
                <SaleTag kind="vetrina" short />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Togli un ${item.name}`} onClick={() => add(item.id, -1)}><Minus size={15} /></button>
                <input aria-label={`Quantità ${item.name}`} className="input !min-h-8 !w-12 !px-1 text-center" inputMode="numeric" value={quantity}
                  onChange={(e) => setCart((c) => ({ ...c, [item.id]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) }))} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Aggiungi un ${item.name}`} onClick={() => add(item.id, 1)}><Plus size={15} /></button>
                <b className="w-16 text-right tabular-nums">{money((item.price ?? 0) * quantity)}</b>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Togli ${item.name} dalla fattura`} onClick={() => setCart((c) => ({ ...c, [item.id]: 0 }))}><X size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <ActionForm
          action={sellItems}
          onSuccess={() => { reset(); setRequestId(newId()); }}
          className="space-y-3"
          confirm={() => (tooMuch ? null : `Registrare la vendita per ${money(total)}${total !== listTotal ? ` (listino ${money(listTotal)})` : ""}?`)}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />
          {flatOn && <input type="hidden" name="flatPrice" value={flatNum ?? ""} />}
          <input name="buyerName" className="input" placeholder="Acquirente (facoltativo)" maxLength={120} />
          {(trainings.length > 0 || itemsTotal > 0) && (
            <dl className="space-y-1 text-[14px]">
              {trainings.length > 0 && <div className="flex justify-between"><dt className="text-fg-2">Addestramenti ({trainings.length})</dt><dd className="tabular-nums">{money(trainingTotal)}</dd></div>}
              {itemsTotal > 0 && <div className="flex justify-between"><dt className="text-fg-2">Oggetti</dt><dd className="tabular-nums">{money(itemsTotal)}</dd></div>}
            </dl>
          )}
          <div className="flex items-center justify-between rounded-lg bg-surface-3 px-3 py-2.5">
            <span className="font-semibold">{flatOn ? "Totale di listino" : "Totale"}</span>
            <span className={clsx("font-bold tabular-nums", flatOn ? "text-[16px] text-fg-3 line-through" : "text-[22px]")}>{money(listTotal)}</span>
          </div>
          {canFlat && !empty && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={flatOn} onChange={(e) => { setFlatOn(e.target.checked); if (e.target.checked && !flat) setFlat(String(listTotal)); }} />
                Prezzo forfettario (cambia il totale)
              </label>
              {flatOn && (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[22px] font-bold">$</span>
                    <input className="input text-[20px] font-bold tabular-nums" inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value)} aria-label="Prezzo forfettario" autoFocus />
                  </div>
                  <p className={clsx("mt-1 text-[13px]", tooMuch ? "font-semibold text-accent-text" : "text-fg-3")}>
                    {discountPct > 0.005 ? `Sconto del ${discountPct.toFixed(1)}% sul listino.` : discountPct < -0.005 ? `${Math.abs(discountPct).toFixed(1)}% sopra il listino.` : "Uguale al listino."}
                    {tooMuch && ` Massimo consentito: ${maxDiscount}% (almeno ${money(listTotal * (1 - maxDiscount / 100))}).`}
                  </p>
                </div>
              )}
            </div>
          )}
          <button className="btn btn-primary w-full" disabled={empty || !requestId || tooMuch || (flatOn && (flatNum == null || !Number.isFinite(flatNum) || flatNum < 0))}>
            Registra vendita · {money(total)}
          </button>
        </ActionForm>
      </div>
    </div>
  );
}

/**
 * Scelta del cavallo da addestrare, con lo stesso campo di ricerca (foto, razza, manto) della registrazione cattura.
 * - "In stalla": cavalli presenti e non ancora addestrati; dopo la vendita vengono segnati "addestrato".
 * - "Altro cavallo": dal catalogo (cavalli del cliente o già venduti), con rarità e targa facoltativa.
 */
function TrainingPicker({ breeds, stable, rareTrainingPrice, inCart, onAdd }: {
  breeds: TrainingBreed[]; stable: StableHorse[]; rareTrainingPrice: number; inCart: number[]; onAdd: (t: TrainingLine) => void;
}) {
  const [mode, setMode] = useState<"stalla" | "catalogo">(stable.length ? "stalla" : "catalogo");
  const [pick, setPick] = useState<HorseOption | null>(null);
  const [rarity, setRarity] = useState<"" | "RARO" | "LEGGENDARIO">("");
  const [plate, setPlate] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const catalogOptions = useMemo(
    () => buildHorseOptions(breeds.map((b) => ({ id: b.id, name: b.name, coats: b.coats.map((c) => ({ id: c.id, name: c.name, image: c.image })) })))
      .map((o) => {
        const c = breeds.find((b) => b.id === o.breedId)?.coats.find((x) => x.id === o.coatId);
        return { ...o, meta: c?.trainingPrice != null ? `addestramento ${money(c.trainingPrice)}` : "senza prezzo di addestramento" };
      }),
    [breeds],
  );
  const stableOptions: HorseOption[] = useMemo(
    () => stable.filter((h) => !inCart.includes(h.id)).map((h) => ({
      key: `h:${h.id}`, breedId: h.breedId, coatId: h.coatId, breed: h.breed,
      coat: `${h.coat}${h.plate ? ` · ${h.plate}` : ""}`, image: h.image,
      meta: [h.rarity === "RARO" ? "raro" : h.rarity === "LEGGENDARIO" ? "leggendario" : null, h.owner, h.price != null ? money(h.price) : "senza prezzo"].filter(Boolean).join(" · "),
    })),
    [stable, inCart],
  );

  const horse = mode === "stalla" && pick ? stable.find((h) => `h:${h.id}` === pick.key) ?? null : null;
  const coat = mode === "catalogo" && pick?.coatId ? breeds.find((b) => b.id === pick.breedId)?.coats.find((c) => c.id === pick.coatId) ?? null : null;
  const price = horse ? horse.price : coat ? (rarity ? rareTrainingPrice : coat.trainingPrice) : null;

  const add = () => {
    if (price == null || !pick) return;
    if (horse) {
      onAdd({ key: newId(), coatId: horse.coatId, horseId: horse.id, label: `${horse.breed} – ${horse.coat}`, image: horse.image, rarity: horse.rarity, plate: horse.plate ?? "", price });
    } else if (coat) {
      onAdd({ key: newId(), coatId: coat.id, horseId: null, label: `${pick.breed} – ${coat.name}`, image: coat.image, rarity: rarity || null, plate: plate.trim().toUpperCase(), price });
    }
    setPick(null); setPlate(""); setRarity(""); setResetKey((k) => k + 1);
  };

  return (
    <div className="card card-pad">
      <h3 className="mb-1 flex items-center gap-2 font-semibold"><SaleTag kind="addestramento" /> Addestramento di un cavallo</h3>
      <p className="mb-3 text-[13.5px] text-fg-3">Il prezzo è quello del listino. Puoi mettere più addestramenti nella stessa fattura.</p>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Quale cavallo">
        {([["stalla", `In stalla (${stable.length})`], ["catalogo", "Altro cavallo (catalogo)"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); setPick(null); setResetKey((x) => x + 1); }}
            className={clsx("min-h-10 rounded-md px-2 text-[13.5px] font-semibold transition-colors", mode === k ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>{l}</button>
        ))}
      </div>
      {mode === "stalla" ? (
        stableOptions.length ? (
          <HorsePicker key={`s${resetKey}`} label="Cavallo in stalla" options={stableOptions} onChange={setPick} breedName={null} coatName={null} placeholder="Cerca razza, manto o targa…" />
        ) : <p className="rounded-lg border border-dashed border-border p-3 text-[14px] text-fg-3">Nessun cavallo in stalla da addestrare (sono già tutti addestrati o in fattura). Usa “Altro cavallo”.</p>
      ) : (
        <div className="space-y-3">
          <HorsePicker key={`c${resetKey}`} label="Razza e manto" options={catalogOptions} onChange={setPick} breedName={null} coatName={null} placeholder="Scrivi per cercare, es. arabo bianco…" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Rarità</span>
              <select className="input" value={rarity} onChange={(e) => setRarity(e.target.value as "" | "RARO" | "LEGGENDARIO")}>
                <option value="">Normale</option>
                <option value="RARO">Raro ({money(rareTrainingPrice)})</option>
                <option value="LEGGENDARIO">Leggendario ({money(rareTrainingPrice)})</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Targa (facoltativa)</span>
              <input className="input uppercase" value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={40} placeholder="Es. AB123" />
            </label>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-fg-2">
          {pick ? (price != null ? <>Prezzo addestramento: <b className="text-fg">{money(price)}</b>{horse && <span className="text-fg-3"> · verrà segnato “addestrato”</span>}</> : <span className="text-accent-text">Questo manto non ha un prezzo di addestramento nel listino.</span>) : "Scegli il cavallo."}
        </span>
        <button type="button" className="btn btn-primary" disabled={!pick || price == null} onClick={add}>
          <Plus size={16} /> Aggiungi alla fattura
        </button>
      </div>
    </div>
  );
}

/** Tabella articoli con ricerca e (per la direzione) modifica. */
export function ItemTable({ items, kind, canManage }: { items: ShopItemRow[]; kind: "VENDITA" | "MATERIA_PRIMA"; canManage: boolean }) {
  const [q, setQ] = useState("");
  const list = items.filter((i) => !q || norm(`${i.name} ${i.group ?? ""} ${i.subgroup ?? ""}`).includes(norm(q))).sort((a, b) => byName(a.group ?? "", b.group ?? "") || byName(a.subgroup ?? "~", b.subgroup ?? "~") || byName(a.name, b.name));
  const groups = [...new Set(items.map((i) => i.group).filter((x): x is string => !!x))].sort(byName);
  const subgroups = [...new Set(items.map((i) => i.subgroup).filter((x): x is string => !!x))].sort(byName);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
        </div>
        {canManage && <ItemEdit kind={kind} label="+ Aggiungi" className="btn btn-primary" groups={groups} subgroups={subgroups} />}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="!pl-5">{kind === "VENDITA" ? "Oggetto" : "Materia prima / oggetto"}</th><th>Gruppo</th><th className="num">{kind === "VENDITA" ? "Prezzo di vendita" : "Prezzo di acquisto"}</th><th>Note</th>{canManage && <th className="!pr-5" />}</tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td className="!pl-5 font-semibold">{i.name}</td>
                <td className="text-fg-2">{i.group ?? "—"}{i.subgroup ? <span className="text-fg-3"> · {i.subgroup}</span> : null}</td>
                <td className="num font-semibold">{i.price != null ? money(i.price) : <span className="text-fg-3">—</span>}</td>
                <td className="max-w-[320px] text-[13.5px] text-fg-2">{[i.priceNote, i.notes].filter(Boolean).join(" · ")}</td>
                {canManage && <td className="!pr-5 text-right"><ItemEdit kind={kind} item={i} label="Modifica" className="btn btn-ghost btn-sm" groups={groups} subgroups={subgroups} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemEdit({ item, kind, label, className, groups, subgroups }: { item?: ShopItemRow; kind: "VENDITA" | "MATERIA_PRIMA"; label: string; className: string; groups: string[]; subgroups: string[] }) {
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
            <label className="block"><span className="field-label">Gruppo</span><input name="group" defaultValue={item?.group ?? ""} className="input" placeholder="Es. Cavalli" list="gruppi-bottega" /></label>
            <label className="block"><span className="field-label">Sottogruppo</span><input name="subgroup" defaultValue={item?.subgroup ?? ""} className="input" placeholder="Es. Ferri" list="sottogruppi-bottega" maxLength={60} /></label>
          </div>
          <label className="block"><span className="field-label">Prezzo $</span><input name="price" type="number" step="0.01" min="0" defaultValue={item?.price ?? ""} className="input" /></label>
          <datalist id="gruppi-bottega">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <datalist id="sottogruppi-bottega">{subgroups.map((g) => <option key={g} value={g} />)}</datalist>
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
