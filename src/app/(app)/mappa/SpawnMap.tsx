"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Move, Plus, Route, X, Crosshair } from "lucide-react";
import type { BreedOption } from "@/lib/catalog";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { HorsePicker, buildHorseOptions, type HorseOption } from "@/components/HorsePicker";
import { HorseThumb } from "@/components/ui";
import { createSpawn, updateSpawn, moveSpawn, deleteSpawn } from "./actions";

const W = 2000;
const H = 1556;

export type SpawnPoint = {
  id: number; x: number; y: number; breedId: number | null; coatId: number | null; breed: string; coat: string | null; image: string | null;
  location: string | null; description: string | null; notes: string | null; author: string; createdAt: string; mine: boolean;
};
export type SpawnMapProps = { spawns: SpawnPoint[]; breeds: BreedOption[]; perms: { add: boolean; manage: boolean } };

const PALETTE = ["#c8161d", "#1d5f8f", "#1f7a3d", "#b45309", "#6b21a8", "#0f766e", "#9a3412", "#3730a3", "#be185d", "#4d7c0f"];
const colorFor = (id: number | null) => (id == null ? "#57534e" : PALETTE[id % PALETTE.length]);

function pinIcon(color: string, opts: { selected?: boolean; num?: number; draggable?: boolean } = {}) {
  const size = opts.selected ? 38 : 30;
  const label = opts.num != null ? `<text x="16" y="15.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${opts.num}</text>` : `<circle cx="16" cy="12" r="4.2" fill="#fff"/>`;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.5));${opts.draggable ? "cursor:grab" : ""}"><path d="M16 31C16 31 4 19.5 4 12a12 12 0 0 1 24 0c0 7.5-12 19-12 19Z" fill="${color}" stroke="#fff" stroke-width="2"/>${label}</svg>`,
  });
}

export default function SpawnMap({ spawns, breeds, perms }: SpawnMapProps) {
  const router = useRouter();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const tempRef = useRef<L.Marker | null>(null);
  const options = useMemo(() => buildHorseOptions(breeds, true), [breeds]);
  const [filters, setFilters] = useState<HorseOption[]>([]);
  const [labels, setLabels] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [routeIds, setRouteIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<SpawnPoint | null>(null);
  const [editing, setEditing] = useState<SpawnPoint | null>(null);
  const addingRef = useRef(adding);
  addingRef.current = adding;

  const visible = useMemo(
    () => (filters.length === 0 ? spawns : spawns.filter((s) => filters.some((f) => (f.coatId ? s.coatId === f.coatId : s.breedId === f.breedId)))),
    [spawns, filters],
  );
  const groups = useMemo(() => {
    const m = new Map<string, SpawnPoint[]>();
    for (const s of visible) m.set(s.breed, [...(m.get(s.breed) ?? []), s]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [H, W]];
    const map = L.map(elRef.current, { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, zoomSnap: 0.25, maxBounds: [[-200, -200], [H + 200, W + 200]], maxBoundsViscosity: 0.8, attributionControl: false });
    L.imageOverlay("/map/rdr2-map.jpg", bounds).addTo(map);
    map.fitBounds(bounds);
    routeRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!addingRef.current) return;
      const { lat, lng } = e.latlng;
      if (lat < 0 || lat > H || lng < 0 || lng > W) return toast.error("Scegli un punto all'interno della mappa.");
      tempRef.current?.remove();
      tempRef.current = L.marker(e.latlng, { icon: pinIcon("#d6b25e", { selected: true }) }).addTo(map);
      setDraft({ x: Math.round(lng * 10) / 10, y: Math.round(lat * 10) / 10 });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Segnaposto
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const s of visible) {
      const routeIdx = routeIds.indexOf(s.id);
      const draggable = perms.manage && editMode;
      const m = L.marker([s.y, s.x], {
        icon: pinIcon(colorFor(s.breedId), { selected: selected?.id === s.id, num: routeIdx >= 0 ? routeIdx + 1 : undefined, draggable }),
        draggable,
        title: `${s.breed}${s.coat ? " – " + s.coat : ""}`,
        keyboard: true,
      });
      if (labels) m.bindTooltip(`${s.breed}${s.coat ? " · " + s.coat : ""}`, { permanent: true, direction: "right", offset: [12, -14], className: "spawn-label" });
      m.on("click", () => setSelected(s));
      m.on("dragend", async () => {
        const p = m.getLatLng();
        const r = await moveSpawn(s.id, Math.round(p.lng * 10) / 10, Math.round(p.lat * 10) / 10);
        if (r.ok) { toast.success(r.message); router.refresh(); } else { toast.error(r.error); m.setLatLng([s.y, s.x]); }
      });
      m.addTo(layer);
    }
  }, [visible, labels, selected, editMode, perms.manage, routeIds, router]);

  // Percorso
  useEffect(() => {
    const layer = routeRef.current;
    if (!layer) return;
    layer.clearLayers();
    const pts = routeIds.map((id) => spawns.find((s) => s.id === id)).filter(Boolean).map((s) => [s!.y, s!.x] as [number, number]);
    if (pts.length >= 2) L.polyline(pts, { color: "#c8161d", weight: 4, opacity: 0.9, dashArray: "8 8" }).addTo(layer);
  }, [routeIds, spawns]);

  useEffect(() => {
    if (!adding) {
      tempRef.current?.remove();
      tempRef.current = null;
      setDraft(null);
    }
    if (elRef.current) elRef.current.style.cursor = adding ? "crosshair" : "";
  }, [adding]);

  useEffect(() => {
    if (selected) setSelected(spawns.find((s) => s.id === selected.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawns]);

  const toggleRoute = (id: number) => setRouteIds((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const focus = (s: SpawnPoint) => { setSelected(s); mapRef.current?.setView([s.y, s.x], 0.5); };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="card flex flex-wrap items-start gap-2 p-3">
          <div className="min-w-[240px] flex-1">
            <HorsePicker options={options} breedName={null} coatName={null} placeholder="Filtra: aggiungi razze o manti…" clearOnSelect
              onChange={(o) => o && setFilters((f) => (f.some((x) => x.key === o.key) ? f : [...f, o]))} />
            {filters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {filters.map((f) => (
                  <button key={f.key} type="button" className="chip" aria-pressed="true" onClick={() => setFilters((x) => x.filter((y) => y.key !== f.key))} aria-label={`Rimuovi filtro ${f.breed} ${f.coat ?? ""}`}>
                    {f.breed}{f.coat ? ` · ${f.coat}` : ""} <X size={14} />
                  </button>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters([])}>Togli filtri</button>
              </div>
            )}
          </div>
          <button type="button" className="chip" aria-pressed={labels} onClick={() => setLabels((v) => !v)}>Nomi</button>
          {perms.manage && (
            <button type="button" className={clsx("btn", editMode ? "btn-primary" : "btn-secondary")} onClick={() => { setEditMode((v) => !v); setAdding(false); }} aria-pressed={editMode}>
              <Move size={16} /> {editMode ? "Fine modifica" : "Modifica"}
            </button>
          )}
          {perms.add && (
            <button type="button" className={clsx("btn", adding ? "btn-secondary" : "btn-primary")} onClick={() => { setAdding((a) => !a); setEditMode(false); }}>
              {adding ? <><X size={16} /> Annulla</> : <><Plus size={16} /> Aggiungi spawn</>}
            </button>
          )}
        </div>
        {(adding || editMode) && (
          <div className="card flex items-center gap-2 border-accent p-2.5 text-[14px] font-semibold text-accent-text">
            <Crosshair size={16} /> {adding ? "Clicca sulla mappa nel punto dell'avvistamento." : "Modalità modifica: trascina i segnaposto per spostarli."}
          </div>
        )}
        <div className="card overflow-hidden p-1.5">
          <div ref={elRef} className="h-[70dvh] min-h-[420px] w-full rounded-lg" />
        </div>
      </div>

      <aside className="space-y-4">
        {selected && (
          <div className="card card-pad fade-up">
            <div className="flex items-start gap-3">
              <HorseThumb src={selected.image} size={44} />
              <div className="min-w-0 flex-1"><h3 className="text-[17px] font-semibold">{selected.breed}</h3><div className="text-fg-3">{selected.coat ?? "Manto non specificato"}</div></div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(null)} aria-label="Chiudi scheda"><X size={16} /></button>
            </div>
            <dl className="mt-3 space-y-2 text-[14px]">
              <div><dt className="eyebrow">Posizione</dt><dd>{selected.location || "—"}</dd></div>
              {selected.description && <div><dt className="eyebrow">Descrizione</dt><dd className="whitespace-pre-wrap">{selected.description}</dd></div>}
              {selected.notes && <div><dt className="eyebrow">Note</dt><dd className="whitespace-pre-wrap">{selected.notes}</dd></div>}
              <div><dt className="eyebrow">Inserito da</dt><dd>{selected.author} · {selected.createdAt}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => toggleRoute(selected.id)}><Route size={15} /> {routeIds.includes(selected.id) ? "Togli dal percorso" : "Aggiungi al percorso"}</button>
              {(perms.manage || selected.mine) && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>Modifica dati</button>}
              {perms.manage && <ActionButton action={deleteSpawn} fields={{ id: selected.id }} label="Elimina" className="btn btn-ghost btn-sm" confirm="Eliminare questo spawn?" />}
            </div>
          </div>
        )}

        {routeIds.length > 0 && (
          <div className="card card-pad">
            <div className="mb-2 flex items-center justify-between"><h3 className="eyebrow">Percorso · {routeIds.length} tappe</h3><button className="btn btn-ghost btn-sm" onClick={() => setRouteIds([])}>Cancella</button></div>
            <ol className="space-y-1 text-[14px]">
              {routeIds.map((id, i) => { const s = spawns.find((x) => x.id === id); return s ? <li key={id}><b className="mr-1.5 text-accent-text">{i + 1}.</b>{s.breed}{s.coat ? ` · ${s.coat}` : ""}{s.location ? <span className="text-fg-3"> — {s.location}</span> : null}</li> : null; })}
            </ol>
          </div>
        )}

        <div className="card max-h-[60dvh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
            <h3 className="eyebrow">Spawn per razza · {visible.length}</h3>
            {visible.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setRouteIds(visible.map((s) => s.id))} title="Usa tutti gli spawn visibili come percorso"><Route size={15} /> Tutti</button>}
          </div>
          {groups.length === 0 ? <p className="p-4 text-fg-3">Nessuno spawn.</p> : groups.map(([breed, items]) => (
            <details key={breed} open className="border-b border-border last:border-0">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 font-semibold">
                <span className="inline-block size-2.5 rounded-full" style={{ background: colorFor(items[0].breedId) }} />{breed}<span className="ml-auto text-[13px] font-normal text-fg-3">{items.length}</span>
              </summary>
              <ul className="pb-2">
                {items.map((s) => (
                  <li key={s.id} className={clsx("flex items-center gap-2 px-4 py-1.5", selected?.id === s.id && "bg-surface-3")}>
                    <input type="checkbox" checked={routeIds.includes(s.id)} onChange={() => toggleRoute(s.id)} aria-label={`Percorso: ${s.breed} ${s.coat ?? ""}`} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => focus(s)}>
                      <span className="block truncate text-[14px]">{s.coat ?? "Manto vario"}</span>
                      {s.location && <span className="block truncate text-[12.5px] text-fg-3">{s.location}</span>}
                    </button>
                    {routeIds.includes(s.id) && <span className="badge badge-solid-accent">{routeIds.indexOf(s.id) + 1}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </aside>

      <SpawnFormModal open={!!draft} title="Nuovo spawn" options={options} point={draft} action={createSpawn} onClose={() => setDraft(null)} onDone={() => { setAdding(false); router.refresh(); }} />
      <SpawnFormModal open={!!editing} title="Modifica spawn" options={options} point={editing ? { x: editing.x, y: editing.y } : null} initial={editing ?? undefined} action={updateSpawn} onClose={() => setEditing(null)} onDone={() => setEditing(null)} />
    </div>
  );
}

function SpawnFormModal({ open, title, options, point, initial, action, onClose, onDone }: {
  open: boolean; title: string; options: HorseOption[]; point: { x: number; y: number } | null; initial?: SpawnPoint;
  action: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>; onClose: () => void; onDone: () => void;
}) {
  const value = initial ? (initial.coatId ? `c:${initial.coatId}` : initial.breedId ? `b:${initial.breedId}` : null) : null;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <ActionForm action={action} onSuccess={onDone} className="space-y-3">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="x" value={point?.x ?? ""} />
        <input type="hidden" name="y" value={point?.y ?? ""} />
        <HorsePicker label="Razza e manto *" options={options} value={value} required placeholder="Cerca… (puoi scegliere anche “tutti i manti”)" />
        <label className="block"><span className="field-label">Posizione</span><input name="location" defaultValue={initial?.location ?? ""} className="input" placeholder="Es. Heartlands, vicino a Emerald Ranch" maxLength={120} /></label>
        <label className="block"><span className="field-label">Descrizione</span><textarea name="description" defaultValue={initial?.description ?? ""} className="input" maxLength={2000} /></label>
        <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={initial?.notes ?? ""} className="input" maxLength={2000} placeholder="Orari, meteo, frequenza…" /></label>
        <button className="btn btn-primary w-full">Salva</button>
      </ActionForm>
    </Modal>
  );
}
