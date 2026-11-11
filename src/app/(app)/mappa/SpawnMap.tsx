"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Move, Plus, Route, X, Crosshair, Maximize2, Minimize2, LocateFixed } from "lucide-react";
import type { BreedOption } from "@/lib/catalog";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { HorsePicker, buildHorseOptions, type HorseOption } from "@/components/HorsePicker";
import { HorseThumb } from "@/components/ui";
import { createSpawn, updateSpawn, moveSpawn, deleteSpawn } from "./actions";
import { NOTE_COLORS } from "./colors";

const W = 2000;
const H = 1556;

type Kind = "CAVALLO" | "POSSIBILE" | "NOTA";

export type SpawnPoint = {
  id: number; kind: Kind; title: string | null; color: string | null;
  x: number; y: number; breedId: number | null; coatId: number | null; breed: string | null; coat: string | null; image: string | null;
  location: string | null; description: string | null; notes: string | null; author: string; createdAt: string; mine: boolean;
};
export type SpawnMapProps = { spawns: SpawnPoint[]; breeds: BreedOption[]; perms: { add: boolean; manage: boolean } };

const KIND_LABEL: Record<Kind, string> = { CAVALLO: "Cavalli", POSSIBILE: "Possibili cavalli", NOTA: "Note" };
const PALETTE = ["#c8161d", "#1d5f8f", "#1f7a3d", "#b45309", "#6b21a8", "#0f766e", "#9a3412", "#3730a3", "#be185d", "#4d7c0f", "#0e7490", "#a16207"];
const breedColor = (id: number | null) => (id == null ? "#57534e" : PALETTE[id % PALETTE.length]);
const pointColor = (s: SpawnPoint) => (s.kind === "NOTA" ? s.color ?? NOTE_COLORS[0] : s.kind === "POSSIBILE" ? "#78716c" : breedColor(s.breedId));
const label = (s: SpawnPoint) => (s.kind === "NOTA" ? s.title ?? "Nota" : `${s.kind === "POSSIBILE" ? "? " : ""}${s.breed ?? "Possibile cavallo"}${s.coat ? " · " + s.coat : ""}`);

/** Le etichette di Leaflet sono HTML: il testo inserito dagli utenti va sempre "disinnescato". */
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#57534e");

function markerIcon(s: SpawnPoint, opts: { selected?: boolean; num?: number; draggable?: boolean }) {
  const color = safeColor(pointColor(s));
  const size = opts.selected ? 40 : 32;
  const num = opts.num != null ? `<circle cx="27" cy="5" r="5" fill="#0b0a09" stroke="#fff" stroke-width="1"/><text x="27" y="7.4" text-anchor="middle" font-size="7" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${opts.num}</text>` : "";
  let body: string;
  let anchorY: number;
  if (s.kind === "NOTA") {
    // segnaposto classico colorato
    body = `<path d="M16 31C16 31 5 20 5 12.5a11 11 0 0 1 22 0C27 20 16 31 16 31Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="12.5" r="4" fill="#fff"/>`;
    anchorY = size - 2;
  } else if (s.kind === "POSSIBILE") {
    body = `<circle cx="16" cy="16" r="13" fill="${color}" stroke="#fff" stroke-width="2" stroke-dasharray="4 2.5"/><text x="16" y="21.5" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" font-family="Inter,sans-serif">?</text>`;
    anchorY = size / 2;
  } else {
    // ferro di cavallo su disco colorato per razza
    body = `<circle cx="16" cy="16" r="13.5" fill="${color}" stroke="#fff" stroke-width="2"/><path d="M11 23.5 10.3 16.5a5.7 5.7 0 0 1 11.4 0L21 23.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12.2" cy="13.6" r=".95" fill="${color}"/><circle cx="19.8" cy="13.6" r=".95" fill="${color}"/><circle cx="11.3" cy="17.6" r=".95" fill="${color}"/><circle cx="20.7" cy="17.6" r=".95" fill="${color}"/>`;
    anchorY = size / 2;
  }
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, anchorY],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="overflow:visible;filter:drop-shadow(0 2px 2px rgba(0,0,0,.55));${opts.draggable ? "cursor:grab" : ""}">${body}${num}</svg>`,
  });
}

export default function SpawnMap({ spawns, breeds, perms }: SpawnMapProps) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const tempRef = useRef<L.Marker | null>(null);
  const options = useMemo(() => buildHorseOptions(breeds, true), [breeds]);
  const [filters, setFilters] = useState<HorseOption[]>([]);
  const [kinds, setKinds] = useState<Kind[]>(["CAVALLO", "POSSIBILE", "NOTA"]);
  const [labels, setLabels] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [full, setFull] = useState(false);
  const [routeIds, setRouteIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<SpawnPoint | null>(null);
  const [editing, setEditing] = useState<SpawnPoint | null>(null);
  const addingRef = useRef(adding);
  addingRef.current = adding;
  const autoFitRef = useRef(true);

  const visible = useMemo(
    () =>
      spawns.filter((s) => {
        if (!kinds.includes(s.kind)) return false;
        if (filters.length === 0 || s.kind === "NOTA") return true;
        return filters.some((f) => (f.coatId ? s.coatId === f.coatId : s.breedId === f.breedId));
      }),
    [spawns, filters, kinds],
  );
  const groups = useMemo(() => {
    const m = new Map<string, SpawnPoint[]>();
    for (const s of visible) {
      const k = s.kind === "NOTA" ? "📌 Note" : s.kind === "POSSIBILE" ? "? Possibili cavalli" : s.breed ?? "Razza sconosciuta";
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => (a[0].startsWith("📌") ? -1 : b[0].startsWith("📌") ? 1 : a[0].startsWith("?") ? -1 : b[0].startsWith("?") ? 1 : a[0].localeCompare(b[0])));
  }, [visible]);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [H, W]];
    const map = L.map(elRef.current, {
      crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.1, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      maxBounds: [[-300, -300], [H + 300, W + 300]], maxBoundsViscosity: 0.8, attributionControl: false, zoomControl: false,
    });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Ingrandisci", zoomOutTitle: "Riduci" }).addTo(map);
    L.imageOverlay("/map/rdr2-map.jpg", bounds, { className: "rdr-map-image" }).addTo(map);
    map.fitBounds(bounds, { padding: [8, 8] });
    routeRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!addingRef.current) return;
      const { lat, lng } = e.latlng;
      if (lat < 0 || lat > H || lng < 0 || lng > W) return toast.error("Scegli un punto all'interno della mappa.");
      tempRef.current?.remove();
      tempRef.current = L.marker(e.latlng, { icon: markerIcon({ kind: "NOTA", color: "#d6b25e" } as SpawnPoint, { selected: true }) }).addTo(map);
      setDraft({ x: Math.round(lng * 10) / 10, y: Math.round(lat * 10) / 10 });
    });
    mapRef.current = map;
    // Finché l'utente non tocca la mappa, a ogni cambio di dimensione si ricentra su tutta la mappa
    const el = elRef.current;
    const stopAuto = () => { autoFitRef.current = false; };
    el.addEventListener("pointerdown", stopAuto);
    el.addEventListener("wheel", stopAuto, { passive: true });
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (autoFitRef.current) map.fitBounds(bounds, { padding: [8, 8], animate: false });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
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
        icon: markerIcon(s, { selected: selected?.id === s.id, num: routeIdx >= 0 ? routeIdx + 1 : undefined, draggable }),
        draggable, title: label(s), keyboard: true, riseOnHover: true,
      });
      if (labels) m.bindTooltip(esc(label(s)), { permanent: true, direction: "right", offset: [14, 0], className: "spawn-label" });
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

  // Schermo intero (con ripiego CSS dove l'API non c'è, es. iPhone)
  const toggleFull = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!full) {
      try { if (el.requestFullscreen) await el.requestFullscreen(); } catch {}
      setFull(true);
    } else {
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
      setFull(false);
    }
    autoFitRef.current = true;
    setTimeout(() => {
      mapRef.current?.invalidateSize();
      mapRef.current?.fitBounds([[0, 0], [H, W]], { padding: [8, 8], animate: false });
    }, 200);
  }, [full]);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setFull(false);
      setTimeout(() => { mapRef.current?.invalidateSize(); if (autoFitRef.current) mapRef.current?.fitBounds([[0, 0], [H, W]], { padding: [8, 8], animate: false }); }, 200);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);

  const toggleRoute = (id: number) => setRouteIds((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const focus = (s: SpawnPoint) => { setSelected(s); mapRef.current?.setView([s.y, s.x], 1); };
  const toggleKind = (k: Kind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <div className="card flex flex-wrap items-start gap-2 p-3">
          <div className="min-w-[220px] flex-1">
            <HorsePicker options={options} breedName={null} coatName={null} placeholder="Filtra cavalli: aggiungi razze o manti…" clearOnSelect
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
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)}>{KIND_LABEL[k]}</button>
            ))}
            <button type="button" className="chip" aria-pressed={labels} onClick={() => setLabels((v) => !v)}>Nomi</button>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {perms.manage && (
              <button type="button" className={clsx("btn flex-1 sm:flex-none", editMode ? "btn-primary" : "btn-secondary")} onClick={() => { setEditMode((v) => !v); setAdding(false); }} aria-pressed={editMode}>
                <Move size={16} /> {editMode ? "Fine modifica" : "Modifica"}
              </button>
            )}
            {perms.add && (
              <button type="button" className={clsx("btn flex-1 sm:flex-none", adding ? "btn-secondary" : "btn-primary")} onClick={() => { setAdding((a) => !a); setEditMode(false); }}>
                {adding ? <><X size={16} /> Annulla</> : <><Plus size={16} /> Aggiungi punto</>}
              </button>
            )}
          </div>
        </div>

        {/* isolate: i livelli interni di Leaflet non possono più coprire menu e finestre */}
        <div
          ref={wrapRef}
          className={clsx(
            "relative isolate overflow-hidden bg-[#d4b98a]",
            full ? "fixed inset-0 z-[70] rounded-none" : "card p-0",
          )}
        >
          {(adding || editMode) && (
            <div className="absolute inset-x-2 top-2 z-[500] flex items-center gap-2 rounded-lg bg-[#0b0a09]/90 px-3 py-2 text-[13.5px] font-semibold text-white">
              <Crosshair size={16} className="shrink-0 text-[#ff5d55]" /> {adding ? "Tocca la mappa nel punto da segnare." : "Modalità modifica: trascina i segnaposto per spostarli."}
            </div>
          )}
          <div className="absolute top-2 right-2 z-[500] flex flex-col gap-2" style={{ marginTop: adding || editMode ? 44 : 0 }}>
            <button type="button" onClick={toggleFull} className="btn btn-icon bg-[#0b0a09]/85 !text-white hover:bg-[#0b0a09]" aria-label={full ? "Esci da schermo intero" : "Schermo intero"} title={full ? "Esci da schermo intero" : "Schermo intero"}>
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button type="button" onClick={() => { autoFitRef.current = true; mapRef.current?.fitBounds([[0, 0], [H, W]], { padding: [8, 8] }); }} className="btn btn-icon bg-[#0b0a09]/85 !text-white hover:bg-[#0b0a09]" aria-label="Mostra tutta la mappa" title="Mostra tutta la mappa">
              <LocateFixed size={18} />
            </button>
          </div>
          {/* Il div gestito da Leaflet non deve mai cambiare classi (React le sovrascriverebbe): cambia solo il contenitore */}
          <div className={clsx("w-full", full ? "h-dvh" : "h-[62dvh] min-h-[340px] sm:h-[72dvh]")}>
            <div ref={elRef} className="h-full w-full" />
          </div>
          {full && selected && (
            <div className="absolute bottom-2 left-2 right-16 z-[500] sm:right-auto sm:w-[360px]">
              <PointCard s={selected} perms={perms} inRoute={routeIds.includes(selected.id)} onRoute={() => toggleRoute(selected.id)} onEdit={() => setEditing(selected)} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        {selected && !full && (
          <PointCard s={selected} perms={perms} inRoute={routeIds.includes(selected.id)} onRoute={() => toggleRoute(selected.id)} onEdit={() => setEditing(selected)} onClose={() => setSelected(null)} />
        )}

        {routeIds.length > 0 && (
          <div className="card card-pad">
            <div className="mb-2 flex items-center justify-between"><h3 className="eyebrow">Percorso · {routeIds.length} tappe</h3><button className="btn btn-ghost btn-sm" onClick={() => setRouteIds([])}>Cancella</button></div>
            <ol className="space-y-1 text-[14px]">
              {routeIds.map((id, i) => { const s = spawns.find((x) => x.id === id); return s ? <li key={id}><b className="mr-1.5 text-accent-text">{i + 1}.</b>{label(s)}{s.location ? <span className="text-fg-3"> — {s.location}</span> : null}</li> : null; })}
            </ol>
          </div>
        )}

        <div className="card max-h-[60dvh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
            <h3 className="eyebrow">Punti sulla mappa · {visible.length}</h3>
            {visible.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setRouteIds(visible.map((s) => s.id))} title="Usa tutti i punti visibili come percorso"><Route size={15} /> Tutti</button>}
          </div>
          {groups.length === 0 ? <p className="p-4 text-fg-3">Nessun punto.</p> : groups.map(([name, items]) => (
            <details key={name} open className="border-b border-border last:border-0">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 font-semibold">
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: safeColor(pointColor(items[0])) }} />
                <span className="truncate">{name.replace(/^📌 |^\? /, "")}</span>
                <span className="ml-auto text-[13px] font-normal text-fg-3">{items.length}</span>
              </summary>
              <ul className="pb-2">
                {items.map((s) => (
                  <li key={s.id} className={clsx("flex items-center gap-2 px-4 py-1.5", selected?.id === s.id && "bg-surface-3")}>
                    <input type="checkbox" checked={routeIds.includes(s.id)} onChange={() => toggleRoute(s.id)} aria-label={`Percorso: ${label(s)}`} />
                    {s.kind === "NOTA" && <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: safeColor(pointColor(s)) }} />}
                    <button className="min-w-0 flex-1 text-left" onClick={() => focus(s)}>
                      <span className="block truncate text-[14px]">{s.kind === "NOTA" ? s.title : s.kind === "POSSIBILE" ? (s.breed ? `${s.breed}${s.coat ? " · " + s.coat : ""}` : "Da verificare") : s.coat ?? "Manto vario"}</span>
                      {s.location && <span className="block truncate text-[12.5px] text-fg-3">{s.location}</span>}
                    </button>
                    {routeIds.includes(s.id) && <span className="badge badge-solid-accent">{routeIds.indexOf(s.id) + 1}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        <div className="card card-pad text-[13px] text-fg-2">
          <h3 className="eyebrow mb-2">Legenda</h3>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2"><Legend kind="CAVALLO" /> Cavallo avvistato (colore della razza)</li>
            <li className="flex items-center gap-2"><Legend kind="POSSIBILE" /> Possibile cavallo da verificare</li>
            <li className="flex items-center gap-2"><Legend kind="NOTA" /> Nota libera (colore a scelta)</li>
          </ul>
        </div>
      </aside>

      <PointFormModal open={!!draft} title="Nuovo punto" options={options} point={draft} action={createSpawn} onClose={() => setDraft(null)} onDone={() => { setAdding(false); router.refresh(); }} />
      <PointFormModal open={!!editing} title="Modifica punto" options={options} point={editing ? { x: editing.x, y: editing.y } : null} initial={editing ?? undefined} action={updateSpawn} onClose={() => setEditing(null)} onDone={() => setEditing(null)} />
    </div>
  );
}

function Legend({ kind }: { kind: Kind }) {
  const html = markerIcon({ kind, color: kind === "NOTA" ? NOTE_COLORS[4] : null, breedId: 1 } as SpawnPoint, {}).options.html as string;
  return <span className="inline-flex size-7 items-center justify-center" dangerouslySetInnerHTML={{ __html: html }} />;
}

function PointCard({ s, perms, inRoute, onRoute, onEdit, onClose }: { s: SpawnPoint; perms: { manage: boolean }; inRoute: boolean; onRoute: () => void; onEdit: () => void; onClose: () => void }) {
  return (
    <div className="card card-pad fade-up">
      <div className="flex items-start gap-3">
        {s.kind === "NOTA" ? <span className="mt-1 inline-block size-4 rounded-full" style={{ background: safeColor(pointColor(s)) }} /> : <HorseThumb src={s.image} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{s.kind === "NOTA" ? "Nota" : s.kind === "POSSIBILE" ? "Possibile cavallo" : "Cavallo"}</div>
          <h3 className="text-[17px] font-semibold">{s.kind === "NOTA" ? s.title : s.breed ?? "Da verificare"}</h3>
          {s.kind !== "NOTA" && s.coat && <div className="text-fg-3">{s.coat}</div>}
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Chiudi scheda"><X size={16} /></button>
      </div>
      <dl className="mt-3 space-y-2 text-[14px]">
        {s.location && <div><dt className="eyebrow">Posizione</dt><dd>{s.location}</dd></div>}
        {s.description && <div><dt className="eyebrow">Descrizione</dt><dd className="whitespace-pre-wrap">{s.description}</dd></div>}
        {s.notes && <div><dt className="eyebrow">Note</dt><dd className="whitespace-pre-wrap">{s.notes}</dd></div>}
        <div><dt className="eyebrow">Inserito da</dt><dd>{s.author} · {s.createdAt}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onRoute}><Route size={15} /> {inRoute ? "Togli dal percorso" : "Aggiungi al percorso"}</button>
        {(perms.manage || s.mine) && <button className="btn btn-secondary btn-sm" onClick={onEdit}>Modifica dati</button>}
        {perms.manage && <ActionButton action={deleteSpawn} fields={{ id: s.id }} label="Elimina" className="btn btn-ghost btn-sm" confirm="Eliminare questo punto dalla mappa?" />}
      </div>
    </div>
  );
}

function PointFormModal({ open, title, options, point, initial, action, onClose, onDone }: {
  open: boolean; title: string; options: HorseOption[]; point: { x: number; y: number } | null; initial?: SpawnPoint;
  action: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>; onClose: () => void; onDone: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "CAVALLO");
  const [color, setColor] = useState(initial?.color ?? NOTE_COLORS[0]);
  useEffect(() => {
    if (open) { setKind(initial?.kind ?? "CAVALLO"); setColor(initial?.color ?? NOTE_COLORS[0]); }
  }, [open, initial]);
  const value = initial ? (initial.coatId ? `c:${initial.coatId}` : initial.breedId ? `b:${initial.breedId}` : null) : null;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <ActionForm action={action} onSuccess={onDone} className="space-y-3">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="x" value={point?.x ?? ""} />
        <input type="hidden" name="y" value={point?.y ?? ""} />
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Tipo di punto">
          {([["CAVALLO", "Cavallo"], ["POSSIBILE", "Possibile ?"], ["NOTA", "Nota"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={clsx("min-h-10 rounded-md text-[14px] font-semibold transition-colors", kind === k ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>{l}</button>
          ))}
        </div>
        {kind === "NOTA" ? (
          <>
            <label className="block"><span className="field-label">Titolo *</span><input name="title" defaultValue={initial?.title ?? ""} className="input" required maxLength={80} placeholder="Es. Accampamento, abbeveratoio, pericolo…" /></label>
            <div>
              <span className="field-label">Colore</span>
              <input type="hidden" name="color" value={color} />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colore">
                {NOTE_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Colore ${c}`} onClick={() => setColor(c)}
                    className={clsx("size-9 rounded-full border-2 transition-transform", color === c ? "scale-110 border-fg" : "border-transparent")} style={{ background: c }} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <HorsePicker
            label={kind === "CAVALLO" ? "Razza e manto *" : "Che cavallo potrebbe essere? (facoltativo)"}
            options={options}
            value={value}
            required={kind === "CAVALLO"}
            placeholder="Cerca… (puoi scegliere anche “tutti i manti”)"
          />
        )}
        <label className="block"><span className="field-label">Posizione</span><input name="location" defaultValue={initial?.location ?? ""} className="input" placeholder="Es. Heartlands, vicino a Emerald Ranch" maxLength={120} /></label>
        <label className="block"><span className="field-label">Descrizione</span><textarea name="description" defaultValue={initial?.description ?? ""} className="input" maxLength={2000} /></label>
        <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={initial?.notes ?? ""} className="input" maxLength={2000} placeholder="Orari, meteo, frequenza…" /></label>
        <button className="btn btn-primary w-full">Salva</button>
      </ActionForm>
    </Modal>
  );
}
