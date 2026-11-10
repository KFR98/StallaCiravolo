"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { BreedOption } from "@/lib/catalog";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { createSpawn, updateSpawn, moveSpawn, deleteSpawn } from "./actions";

const W = 2000;
const H = 1556;

export type SpawnPoint = {
  id: number; x: number; y: number; breedId: number | null; coatId: number | null; breed: string; coat: string | null;
  location: string | null; description: string | null; notes: string | null; author: string; createdAt: string; mine: boolean;
};

export type SpawnMapProps = { spawns: SpawnPoint[]; breeds: BreedOption[]; perms: { add: boolean; manage: boolean } };

// Colore del segnaposto per razza (stabile)
const PALETTE = ["#8e2b1f", "#3f5f73", "#55703f", "#a8823a", "#6b4428", "#7a3e6a", "#2f6b62", "#9a5b1d", "#4b4f8a", "#5c5c5c"];
const colorFor = (id: number | null) => (id == null ? "#5c5c5c" : PALETTE[id % PALETTE.length]);

function icon(color: string, selected: boolean) {
  const size = selected ? 38 : 30;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    popupAnchor: [0, -size + 6],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.55))">
      <path d="M16 31 C16 31 4 19 4 11.5 A12 12 0 0 1 28 11.5 C28 19 16 31 16 31Z" fill="${color}" stroke="#f1e4c6" stroke-width="1.6"/>
      <path d="M10.5 15.5 C10 9.5 12.3 6.5 16 6.5 C19.7 6.5 22 9.5 21.5 15.5" fill="none" stroke="#f1e4c6" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="11" cy="11" r=".9" fill="${color}"/><circle cx="21" cy="11" r=".9" fill="${color}"/>
      <circle cx="11.6" cy="14" r=".9" fill="${color}"/><circle cx="20.4" cy="14" r=".9" fill="${color}"/>
    </svg>`,
  });
}

export default function SpawnMap({ spawns, breeds, perms }: SpawnMapProps) {
  const router = useRouter();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tempRef = useRef<L.Marker | null>(null);
  const [breedF, setBreedF] = useState<number | "">("");
  const [coatF, setCoatF] = useState<number | "">("");
  const [labels, setLabels] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<SpawnPoint | null>(null);
  const [editing, setEditing] = useState<SpawnPoint | null>(null);
  const addingRef = useRef(adding);
  addingRef.current = adding;

  const visible = useMemo(
    () => spawns.filter((s) => (breedF === "" || s.breedId === breedF) && (coatF === "" || s.coatId === coatF)),
    [spawns, breedF, coatF],
  );
  const filterBreed = breeds.find((b) => b.id === breedF);

  // Inizializzazione mappa
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [H, W]];
    const map = L.map(elRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 2,
      zoomSnap: 0.25,
      maxBounds: [[-200, -200], [H + 200, W + 200]],
      maxBoundsViscosity: 0.8,
      attributionControl: false,
    });
    L.imageOverlay("/map/rdr2-map.jpg", bounds).addTo(map);
    map.fitBounds(bounds);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!addingRef.current) return;
      const { lat, lng } = e.latlng;
      if (lat < 0 || lat > H || lng < 0 || lng > W) return toast.error("Seleziona un punto all'interno della mappa.");
      tempRef.current?.remove();
      tempRef.current = L.marker(e.latlng, { icon: icon("#d6b25e", true) }).addTo(map);
      setDraft({ x: Math.round(lng * 10) / 10, y: Math.round(lat * 10) / 10 });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Disegno dei segnaposto
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const s of visible) {
      const canMove = perms.manage || s.mine;
      const m = L.marker([s.y, s.x], { icon: icon(colorFor(s.breedId), selected?.id === s.id), draggable: canMove && !adding, title: `${s.breed}${s.coat ? " – " + s.coat : ""}` });
      if (labels) m.bindTooltip(`${s.breed}${s.coat ? " · " + s.coat : ""}`, { permanent: true, direction: "right", offset: [12, -14], className: "spawn-label" });
      m.on("click", () => setSelected(s));
      m.on("dragend", async () => {
        const p = m.getLatLng();
        const r = await moveSpawn(s.id, Math.round(p.lng * 10) / 10, Math.round(p.lat * 10) / 10);
        if (r.ok) {
          toast.success(r.message);
          router.refresh();
        } else {
          toast.error(r.error);
          m.setLatLng([s.y, s.x]);
        }
      });
      m.addTo(layer);
    }
  }, [visible, labels, selected, adding, perms.manage, router]);

  useEffect(() => {
    if (!adding) {
      tempRef.current?.remove();
      tempRef.current = null;
      setDraft(null);
    }
    if (elRef.current) elRef.current.style.cursor = adding ? "crosshair" : "";
  }, [adding]);

  // Mantiene la scheda aggiornata dopo un refresh
  useEffect(() => {
    if (selected) setSelected(spawns.find((s) => s.id === selected.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawns]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="panel panel-pad flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={breedF} onChange={(e) => { setBreedF(e.target.value ? Number(e.target.value) : ""); setCoatF(""); }}>
            <option value="">Tutte le razze</option>
            {breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input !w-auto" value={coatF} disabled={!filterBreed} onChange={(e) => setCoatF(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Tutti i manti</option>
            {filterBreed?.coats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="size-4 accent-[#5a3a22]" />Nomi sulla mappa</label>
          <span className="text-ink-soft italic">{visible.length} spawn</span>
          {perms.add && (
            <button className={clsx("btn ml-auto", adding ? "btn-danger" : "btn-gold")} onClick={() => setAdding((a) => !a)}>
              {adding ? "Annulla inserimento" : "+ Aggiungi spawn"}
            </button>
          )}
        </div>
        {adding && <div className="panel panel-pad !py-2 text-center title-fell text-blood">Clicca sulla mappa nel punto dell&apos;avvistamento.</div>}
        <div className="panel overflow-hidden p-1.5">
          <div ref={elRef} className="h-[70dvh] min-h-[420px] w-full" />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="panel panel-pad">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="title-fell text-[20px] text-leather">{selected.breed}</h3>
                  <div className="italic">{selected.coat ?? "Manto non specificato"}</div>
                </div>
                <button className="text-ink-soft" onClick={() => setSelected(null)} aria-label="Chiudi">✕</button>
              </div>
              <dl className="mt-3 space-y-1.5 text-[15px]">
                <div><dt className="label">Posizione</dt><dd>{selected.location || "—"} <span className="text-[13px] text-ink-soft">({Math.round(selected.x)}, {Math.round(selected.y)})</span></dd></div>
                <div><dt className="label">Descrizione</dt><dd className="whitespace-pre-wrap">{selected.description || "—"}</dd></div>
                <div><dt className="label">Note</dt><dd className="whitespace-pre-wrap">{selected.notes || "—"}</dd></div>
                <div><dt className="label">Inserito da</dt><dd>{selected.author} · {selected.createdAt}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => mapRef.current?.setView([selected.y, selected.x], 1)}>Centra</button>
                {(perms.manage || selected.mine) && <button className="btn btn-primary btn-sm" onClick={() => setEditing(selected)}>Modifica</button>}
                {perms.manage && <ActionButton action={deleteSpawn} fields={{ id: selected.id }} label="Elimina" className="btn btn-danger btn-sm" confirm="Eliminare questo spawn?" />}
              </div>
              {(perms.manage || selected.mine) && <p className="mt-2 text-[12.5px] text-ink-soft italic">Puoi anche trascinare il segnaposto per spostarlo.</p>}
            </>
          ) : (
            <p className="italic text-ink-soft">Seleziona un segnaposto sulla mappa per vederne la scheda.</p>
          )}
        </div>
        <div className="panel panel-pad max-h-[46dvh] overflow-y-auto">
          <h3 className="label mb-2">Elenco spawn</h3>
          {visible.length === 0 ? <p className="italic text-ink-soft">Nessuno spawn.</p> : (
            <ul className="space-y-1">
              {visible.map((s) => (
                <li key={s.id}>
                  <button className={clsx("w-full rounded-[2px] px-2 py-1 text-left hover:bg-gold-bright/15", selected?.id === s.id && "bg-gold-bright/25")} onClick={() => { setSelected(s); mapRef.current?.setView([s.y, s.x], 0.5); }}>
                    <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: colorFor(s.breedId) }} />
                    <b>{s.breed}</b>{s.coat ? ` – ${s.coat}` : ""}
                    {s.location && <div className="pl-4.5 text-[13px] text-ink-soft">{s.location}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <SpawnFormModal
        open={!!draft}
        title="Nuovo spawn"
        breeds={breeds}
        point={draft}
        action={createSpawn}
        onClose={() => setDraft(null)}
        onDone={() => { setAdding(false); router.refresh(); }}
      />
      <SpawnFormModal
        open={!!editing}
        title="Modifica spawn"
        breeds={breeds}
        point={editing ? { x: editing.x, y: editing.y } : null}
        initial={editing ?? undefined}
        action={updateSpawn}
        onClose={() => setEditing(null)}
        onDone={() => setEditing(null)}
      />
    </div>
  );
}

function SpawnFormModal({ open, title, breeds, point, initial, action, onClose, onDone }: {
  open: boolean; title: string; breeds: BreedOption[]; point: { x: number; y: number } | null; initial?: SpawnPoint;
  action: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>; onClose: () => void; onDone: () => void;
}) {
  const [breedId, setBreedId] = useState<number | "">(initial?.breedId ?? "");
  useEffect(() => setBreedId(initial?.breedId ?? ""), [initial, open]);
  const breed = breeds.find((b) => b.id === breedId);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <ActionForm action={action} onSuccess={onDone} className="space-y-3">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="x" value={point?.x ?? ""} />
        <input type="hidden" name="y" value={point?.y ?? ""} />
        <label className="block"><span className="label mb-1 block">Razza *</span>
          <select name="breedId" className="input" required value={breedId} onChange={(e) => setBreedId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— Seleziona —</option>{breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label mb-1 block">Manto</span>
          <select name="coatId" className="input" defaultValue={initial?.coatId ?? ""} key={String(breedId)}>
            <option value="">Non specificato / vari</option>{breed?.coats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label mb-1 block">Posizione</span><input name="location" defaultValue={initial?.location ?? ""} className="input" placeholder="Es. Heartlands, vicino a Emerald Ranch" maxLength={120} /></label>
        <label className="block"><span className="label mb-1 block">Descrizione</span><textarea name="description" defaultValue={initial?.description ?? ""} className="input" maxLength={2000} /></label>
        <label className="block"><span className="label mb-1 block">Note</span><textarea name="notes" defaultValue={initial?.notes ?? ""} className="input" maxLength={2000} placeholder="Orari, meteo, frequenza…" /></label>
        <button className="btn btn-primary w-full">Salva</button>
      </ActionForm>
    </Modal>
  );
}
