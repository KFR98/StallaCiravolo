"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Move, Plus, Route, X, Crosshair, Maximize2, Minimize2, LocateFixed, SlidersHorizontal, Check, EyeOff, ChevronRight, Search, Bookmark, Save } from "lucide-react";
import type { BreedOption } from "@/lib/catalog";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { HorsePicker, buildHorseOptions, matchHorse, type HorseOption } from "@/components/HorsePicker";
import { HorseThumb } from "@/components/ui";
import { createSpawn, updateSpawn, moveSpawn, deleteSpawn, saveNoteNames } from "./actions";
import { NOTE_COLORS, NOTE_COLOR_DEFAULT_NAMES, noteColorName } from "./colors";

const W = 2000;
const H = 1556;

type Kind = "CAVALLO" | "POSSIBILE" | "NOTA" | "RARO" | "LEGGENDARIO";

export type SpawnPoint = {
  id: number; kind: Kind; title: string | null; color: string | null;
  x: number; y: number; breedId: number | null; coatId: number | null; breed: string | null; coat: string | null; image: string | null;
  location: string | null; description: string | null; notes: string | null; author: string; createdAt: string; mine: boolean;
};
export type MapTiles = { v: string; k: number; offset: number; extra: number };
export type SpawnMapProps = { spawns: SpawnPoint[]; breeds: BreedOption[]; perms: { add: boolean; manage: boolean }; noteNames: Record<string, string>; tiles: MapTiles | null };

const KIND_LABEL: Record<Kind, string> = { CAVALLO: "Cavalli", POSSIBILE: "Possibili cavalli", RARO: "Rari", LEGGENDARIO: "Leggendari", NOTA: "Note" };
const RARE_COLOR = "#7c3aed";
const LEGEND_COLOR = "#c99a1c";
const isSpecial = (k: Kind) => k === "RARO" || k === "LEGGENDARIO";
/** Nome mostrato per rari e leggendari: il nome libero, altrimenti la razza */
const specialName = (s: SpawnPoint) => s.title?.trim() || s.breed || "Senza nome";
const PALETTE = ["#c8161d", "#1d5f8f", "#1f7a3d", "#b45309", "#6b21a8", "#0f766e", "#9a3412", "#3730a3", "#be185d", "#4d7c0f", "#0e7490", "#a16207"];
const breedColor = (id: number | null) => (id == null ? "#57534e" : PALETTE[id % PALETTE.length]);
const pointColor = (s: SpawnPoint) =>
  s.kind === "NOTA" ? s.color ?? NOTE_COLORS[0] : s.kind === "POSSIBILE" ? "#78716c" : s.kind === "RARO" ? RARE_COLOR : s.kind === "LEGGENDARIO" ? LEGEND_COLOR : breedColor(s.breedId);
const label = (s: SpawnPoint) => {
  if (s.kind === "NOTA") return s.title ?? "Nota";
  if (isSpecial(s.kind)) return `${s.kind === "RARO" ? "Raro" : "Leggendario"} · ${specialName(s)}${s.title && s.breed ? ` (${s.breed})` : ""}`;
  return `${s.kind === "POSSIBILE" ? "? " : ""}${s.breed ?? "Possibile cavallo"}${s.coat ? " · " + s.coat : ""}`;
};

/** Le etichette di Leaflet sono HTML: il testo inserito dagli utenti va sempre "disinnescato". */
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#57534e");

/* ───────── Filtri di visualizzazione ─────────
 * sel:   razze ("b:<id>", "b:none") e manti ("c:<id>") da mostrare; "p:none" = possibili senza razza.
 *        Vuoto = tutti. Toccando un elemento si vede SOLO quello (e gli altri eventualmente aggiunti).
 * notes: colori (categorie) delle note da mostrare; vuoto = tutte.
 */
type Filters = { sel: string[]; notes: string[]; kinds: Kind[]; mine: boolean; labels: boolean };
type Preset = { name: string; sel: string[]; notes: string[]; kinds: Kind[]; mine: boolean };
const ALL_KINDS: Kind[] = ["CAVALLO", "POSSIBILE", "RARO", "LEGGENDARIO", "NOTA"];
const DEFAULT_FILTERS: Filters = { sel: [], notes: [], kinds: ALL_KINDS, mine: false, labels: true };
const STORE = "mappa-filtri-v1";
const STORE_PRESETS = "mappa-filtri-salvati-v1";
const noteColor = (s: SpawnPoint) => safeColor(s.color ?? NOTE_COLORS[0]);
const strArr = (v: unknown, max = 500) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length < 100).slice(0, max) : []);
/** Chiave filtro di un raro/leggendario: tipo + nome (senza maiuscole), così punti con lo stesso nome stanno insieme */
const specialKey = (s: SpawnPoint) => `${s.kind === "RARO" ? "r" : "l"}:${specialName(s).toLowerCase()}`;
const kindArr = (v: unknown) => strArr(v).filter((k): k is Kind => (ALL_KINDS as string[]).includes(k));

function horseKey(s: SpawnPoint) {
  if (s.breedId == null) return s.kind === "POSSIBILE" ? "p:none" : "b:none";
  return `b:${s.breedId}`;
}

function isVisible(s: SpawnPoint, f: Filters, breedsWithSelCoat: Set<number>) {
  if (!f.kinds.includes(s.kind)) return false;
  if (f.mine && !s.mine) return false;
  if (s.kind === "NOTA") return f.notes.length === 0 || f.notes.includes(noteColor(s));
  if (f.sel.length === 0) return true;
  if (isSpecial(s.kind)) return f.sel.includes(specialKey(s));
  if (f.sel.includes(horseKey(s))) return true;
  if (s.coatId != null) return f.sel.includes(`c:${s.coatId}`);
  // punto "tutti i manti": compare se di quella razza è scelto almeno un manto
  return s.breedId != null && breedsWithSelCoat.has(s.breedId);
}

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
  } else if (s.kind === "RARO") {
    // rombo viola con stella
    body = `<path d="M16 1.5 30.5 16 16 30.5 1.5 16Z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M16 9.2l2 4.3 4.6.5-3.4 3.1 1 4.6L16 19.4l-4.2 2.3 1-4.6-3.4-3.1 4.6-.5Z" fill="#fff"/>`;
    anchorY = size / 2;
  } else if (s.kind === "LEGGENDARIO") {
    // disco oro con doppio bordo e stella grande
    body = `<circle cx="16" cy="16" r="14" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="10.6" fill="none" stroke="#5c4306" stroke-width="1.2" opacity=".7"/><path d="M16 6.8l2.7 5.6 6.1.7-4.5 4.2 1.2 6.1L16 20.4l-5.5 3 1.2-6.1-4.5-4.2 6.1-.7Z" fill="#fff" stroke="#5c4306" stroke-width=".6"/>`;
    anchorY = size / 2;
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

export default function SpawnMap({ spawns, breeds, perms, noteNames, tiles }: SpawnMapProps) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const tempRef = useRef<L.Marker | null>(null);
  const options = useMemo(() => buildHorseOptions(breeds, true), [breeds]);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showFilters, setShowFilters] = useState(false); // pannello filtri sopra la mappa a schermo intero
  const [catOpen, setCatOpen] = useState(false);
  const loadedRef = useRef(false);
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

  // Filtri salvati nel browser: alla prossima apertura la mappa è come l'hai lasciata
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "null");
      if (v && typeof v === "object") {
        setF({ sel: strArr(v.sel), notes: strArr(v.notes), kinds: Array.isArray(v.kinds) ? kindArr(v.kinds) : ALL_KINDS, mine: v.mine === true, labels: v.labels !== false });
      }
      const ps = JSON.parse(localStorage.getItem(STORE_PRESETS) || "[]");
      if (Array.isArray(ps)) {
        setPresets(ps.filter((x) => x && typeof x.name === "string").slice(0, 20).map((x) => ({ name: String(x.name).slice(0, 30), sel: strArr(x.sel), notes: strArr(x.notes), kinds: Array.isArray(x.kinds) ? kindArr(x.kinds) : ALL_KINDS, mine: x.mine === true })));
      }
    } catch {}
    loadedRef.current = true;
  }, []);
  useEffect(() => {
    if (!loadedRef.current) return;
    try { localStorage.setItem(STORE, JSON.stringify(f)); } catch {}
  }, [f]);
  const savePresets = (next: Preset[]) => {
    setPresets(next);
    try { localStorage.setItem(STORE_PRESETS, JSON.stringify(next)); } catch {}
  };

  const visible = useMemo(() => {
    const coatBreed = new Map(options.filter((o) => o.coatId != null).map((o) => [`c:${o.coatId}`, o.breedId]));
    const breedsWithSelCoat = new Set(f.sel.map((k) => coatBreed.get(k)).filter((b): b is number => b != null));
    return spawns.filter((s) => isVisible(s, f, breedsWithSelCoat));
  }, [spawns, f, options]);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [H, W]];
    // Come CRS.Simple, ma con l'origine dei pixel in alto a sinistra: i tasselli combaciano con l'immagine.
    // Le coordinate dei punti salvati (lat = y dal basso, lng = x) restano identiche.
    const crs = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0, -1, H) });
    // Zoom massimo: risoluzione vera dell'immagine + eventuali livelli extra scelti dall'admin
    // (oltre la risoluzione vera il browser ingrandisce in modo morbido, senza quadretti).
    const maxZoom = tiles ? tiles.k + Math.max(0, Math.min(2, tiles.extra)) : 1;
    const map = L.map(elRef.current, {
      crs, minZoom: -3, maxZoom, zoomSnap: 0.1, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      maxBounds: [[-300, -300], [H + 300, W + 300]], maxBoundsViscosity: 0.8, attributionControl: false, zoomControl: false,
    });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Ingrandisci", zoomOutTitle: "Riduci" }).addTo(map);
    // Con i tasselli HD si usa SOLO la nuova mappa. (Prima l'immagine semplice stava nel livello
    // "overlay", che Leaflet disegna SOPRA i tasselli: copriva la mappa nuova.)
    if (!tiles) L.imageOverlay("/map/rdr2-map.jpg", bounds, { className: "rdr-map-image" }).addTo(map);
    if (tiles) {
      L.tileLayer(`/api/mappa/tiles/${tiles.v}/{z}/{y}/{x}`, {
        tileSize: 256, zoomOffset: tiles.offset, minNativeZoom: -tiles.offset, maxNativeZoom: tiles.k,
        minZoom: -3, maxZoom, bounds, noWrap: true, keepBuffer: 3, className: "rdr-map-tiles",
      }).addTo(map);
    }
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
    // la mappa si crea una volta sola; con nuovi tasselli la pagina rimonta il componente (key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (f.labels) m.bindTooltip(esc(label(s)), { permanent: true, direction: "right", offset: [14, 0], className: "spawn-label" });
      m.on("click", () => setSelected(s));
      m.on("dragend", async () => {
        const p = m.getLatLng();
        const r = await moveSpawn(s.id, Math.round(p.lng * 10) / 10, Math.round(p.lat * 10) / 10);
        if (r.ok) { toast.success(r.message); router.refresh(); } else { toast.error(r.error); m.setLatLng([s.y, s.x]); }
      });
      m.addTo(layer);
    }
  }, [visible, f.labels, selected, editMode, perms.manage, routeIds, router]);

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
  const focus = (s: SpawnPoint) => { setSelected(s); mapRef.current?.setView([s.y, s.x], Math.max(mapRef.current.getZoom(), 1)); };
  const addSel = (key: string) => setF((x) => (x.sel.includes(key) ? x : { ...x, sel: [...x.sel, key] }));
  const filtering = f.sel.length > 0 || f.notes.length > 0 || f.mine || f.kinds.length < ALL_KINDS.length;
  const resetFilters = () => setF((x) => ({ ...DEFAULT_FILTERS, labels: x.labels }));

  const panelProps = {
    spawns, visible, f, setF, presets, savePresets, options, routeIds, toggleRoute, focus, noteNames,
    canManage: perms.manage, onEditCategories: () => setCatOpen(true),
    selectedId: selected?.id ?? null, filtering, resetFilters,
    onRouteAll: () => setRouteIds(visible.map((s) => s.id)),
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <div className="card flex flex-wrap items-start gap-2 p-3">
          <div className="min-w-[220px] flex-1">
            <HorsePicker options={options} breedName={null} coatName={null} placeholder="Mostra solo… cerca razza o manto" clearOnSelect
              onChange={(o) => o && addSel(o.key)} />
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
          <ActiveFilters {...panelProps} />
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
            {full && (
              <button type="button" onClick={() => setShowFilters((v) => !v)} aria-pressed={showFilters} className={clsx("btn btn-icon relative !text-white", showFilters ? "bg-[#c8161d] hover:bg-[#e01f27]" : "bg-[#0b0a09]/85 hover:bg-[#0b0a09]")} aria-label="Filtri" title="Filtri">
                <SlidersHorizontal size={18} />
                {filtering && !showFilters && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[#ff5d55] ring-2 ring-[#0b0a09]" />}
              </button>
            )}
            <button type="button" onClick={() => { autoFitRef.current = true; mapRef.current?.fitBounds([[0, 0], [H, W]], { padding: [8, 8] }); }} className="btn btn-icon bg-[#0b0a09]/85 !text-white hover:bg-[#0b0a09]" aria-label="Mostra tutta la mappa" title="Mostra tutta la mappa">
              <LocateFixed size={18} />
            </button>
          </div>
          {/* Il div gestito da Leaflet non deve mai cambiare classi (React le sovrascriverebbe): cambia solo il contenitore */}
          <div className={clsx("w-full", full ? "h-dvh" : "h-[62dvh] min-h-[340px] sm:h-[72dvh]")}>
            <div ref={elRef} className="h-full w-full" />
          </div>
          {full && showFilters && (
            <div className="absolute top-2 bottom-2 left-2 z-[500] flex w-[min(360px,calc(100%-4.5rem))]">
              <FilterPanel {...panelProps} className="h-full w-full" onClose={() => setShowFilters(false)} />
            </div>
          )}
          {full && selected && (
            <div className={clsx("absolute bottom-2 z-[500]", showFilters ? "right-16 hidden w-[340px] lg:block" : "left-2 right-16 sm:right-auto sm:w-[360px]")}>
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
              {routeIds.map((id, i) => { const s = spawns.find((x) => x.id === id); return s ? <li key={id} className="flex items-start gap-1.5"><b className="text-accent-text">{i + 1}.</b><span className="min-w-0 flex-1">{label(s)}{s.location ? <span className="text-fg-3"> — {s.location}</span> : null}</span><button className="btn btn-ghost btn-icon btn-sm -my-1" onClick={() => toggleRoute(id)} aria-label={`Togli dal percorso: ${label(s)}`}><X size={14} /></button></li> : null; })}
            </ol>
          </div>
        )}

        {!full && <FilterPanel {...panelProps} className="max-h-[78dvh]" />}

        <div className="card card-pad text-[13px] text-fg-2">
          <h3 className="eyebrow mb-2">Legenda</h3>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2"><Legend kind="CAVALLO" /> Cavallo avvistato (colore della razza)</li>
            <li className="flex items-center gap-2"><Legend kind="POSSIBILE" /> Possibile cavallo da verificare</li>
            <li className="flex items-center gap-2"><Legend kind="RARO" /> Cavallo raro</li>
            <li className="flex items-center gap-2"><Legend kind="LEGGENDARIO" /> Cavallo leggendario</li>
            <li className="flex items-center gap-2"><Legend kind="NOTA" /> Nota libera: il colore fa da categoria (es. rosso = pericolo)</li>
          </ul>
        </div>
      </aside>

      <CategoriesModal open={catOpen} onClose={() => setCatOpen(false)} names={noteNames} />
      <PointFormModal open={!!draft} title="Nuovo punto" noteNames={noteNames} options={options} point={draft} action={createSpawn} onClose={() => setDraft(null)} onDone={() => { setAdding(false); router.refresh(); }} />
      <PointFormModal open={!!editing} title="Modifica punto" noteNames={noteNames} options={options} point={editing ? { x: editing.x, y: editing.y } : null} initial={editing ?? undefined} action={updateSpawn} onClose={() => setEditing(null)} onDone={() => setEditing(null)} />
    </div>
  );
}

/* ───────── Pannello filtri (stile rdr2map, adattato al roleplay) ───────── */

type PanelProps = {
  spawns: SpawnPoint[]; visible: SpawnPoint[]; f: Filters; setF: React.Dispatch<React.SetStateAction<Filters>>;
  presets: Preset[]; savePresets: (p: Preset[]) => void; options: HorseOption[]; noteNames: Record<string, string>;
  canManage: boolean; onEditCategories: () => void;
  routeIds: number[]; toggleRoute: (id: number) => void; focus: (s: SpawnPoint) => void; selectedId: number | null;
  filtering: boolean; resetFilters: () => void; onRouteAll: () => void;
};

function keyLabel(key: string, options: HorseOption[]) {
  if (key === "b:none") return "Razza sconosciuta";
  if (key === "p:none") return "Possibili da verificare";
  if (key.startsWith("r:") || key.startsWith("l:")) {
    const n = key.slice(2);
    return `${key[0] === "r" ? "Raro" : "Leggendario"} · ${n.charAt(0).toUpperCase()}${n.slice(1)}`;
  }
  const o = options.find((x) => x.key === key);
  return o ? (o.coat ? `${o.breed} · ${o.coat}` : o.breed) : "?";
}

/** Riepilogo dei filtri attivi sopra la mappa (utile soprattutto su telefono, dove il pannello è sotto). */
function ActiveFilters({ f, setF, options, visible, spawns, filtering, resetFilters, noteNames }: PanelProps) {
  if (!filtering) return null;
  const hiddenKinds = ALL_KINDS.filter((k) => !f.kinds.includes(k));
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border pt-2">
      <span className="mr-1 text-[13px] font-semibold text-fg-2">Vedi {visible.length} di {spawns.length}:</span>
      {f.sel.map((k) => (
        <button key={k} type="button" className="chip" aria-pressed="true" onClick={() => setF((x) => ({ ...x, sel: x.sel.filter((y) => y !== k) }))} aria-label={`Togli filtro ${keyLabel(k, options)}`}>
          {keyLabel(k, options)} <X size={14} />
        </button>
      ))}
      {f.notes.map((c) => (
        <button key={c} type="button" className="chip" aria-pressed="true" onClick={() => setF((x) => ({ ...x, notes: x.notes.filter((y) => y !== c) }))} aria-label="Togli filtro colore nota">
          <span className="inline-block size-3 rounded-full ring-1 ring-white/60" style={{ background: c }} /> {noteColorName(noteNames, c)} <X size={14} />
        </button>
      ))}
      {f.mine && <button type="button" className="chip" aria-pressed="true" onClick={() => setF((x) => ({ ...x, mine: false }))}>Solo i miei <X size={14} /></button>}
      {hiddenKinds.map((k) => (
        <button key={k} type="button" className="chip" onClick={() => setF((x) => ({ ...x, kinds: [...x.kinds, k] }))} title="Tocca per mostrarli di nuovo">
          <EyeOff size={14} /> {KIND_LABEL[k]} nascosti
        </button>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Mostra tutto</button>
    </div>
  );
}

type RowState = "sel" | "inherit" | "off" | "neutral";

function FilterRow({ state, onToggle, lead, name, sub, count, expanded, onExpand, title }: {
  state: RowState; onToggle: () => void; lead: React.ReactNode; name: string; sub?: string; count: number;
  expanded?: boolean; onExpand?: () => void; title: string;
}) {
  return (
    <div className={clsx("group flex items-stretch border-l-[3px] transition-colors", state === "sel" ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-3", state === "off" && "opacity-55 hover:opacity-100")}>
      <button type="button" onClick={onToggle} aria-pressed={state === "sel"} title={title} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-1 pl-3 text-left">
        {lead}
        <span className="min-w-0 flex-1">
          <span className={clsx("block truncate text-[14.5px]", state === "sel" ? "font-semibold text-fg" : "font-medium")}>{name}</span>
          {sub && <span className="block truncate text-[12.5px] text-fg-3">{sub}</span>}
        </span>
        <span className="shrink-0 text-[13px] text-fg-3 tabular-nums">{count}</span>
        <span className="flex w-5 shrink-0 justify-center" aria-hidden="true">
          {state === "sel" ? <Check size={17} className="text-accent-text" strokeWidth={3} /> : state === "inherit" ? <Check size={16} className="text-fg-3" /> : state === "off" ? <EyeOff size={15} className="text-fg-3" /> : null}
        </span>
      </button>
      {onExpand && (
        <button type="button" onClick={onExpand} aria-expanded={expanded} aria-label={expanded ? `Chiudi ${name}` : `Apri ${name}: manti e punti`} className="flex w-10 shrink-0 items-center justify-center text-fg-3 hover:text-fg">
          <ChevronRight size={18} className={clsx("transition-transform", expanded && "rotate-90")} />
        </button>
      )}
    </div>
  );
}

function PointRow({ s, text, routeIds, toggleRoute, focus, selectedId }: { s: SpawnPoint; text: string } & Pick<PanelProps, "routeIds" | "toggleRoute" | "focus" | "selectedId">) {
  const idx = routeIds.indexOf(s.id);
  return (
    <li className={clsx("flex items-center gap-1 py-0.5 pr-2 pl-9", selectedId === s.id && "bg-surface-3")}>
      <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => focus(s)} title="Mostra sulla mappa">
        <span className="block truncate text-[13.5px]">{s.location || text}</span>
        <span className="block truncate text-[12px] text-fg-3">{s.location ? `${text} · ` : ""}{s.author} · {s.createdAt}</span>
      </button>
      {idx >= 0 && <span className="badge badge-solid-accent">{idx + 1}</span>}
      <button type="button" onClick={() => toggleRoute(s.id)} aria-pressed={idx >= 0} className={clsx("btn btn-icon btn-sm", idx >= 0 ? "btn-secondary !text-accent-text" : "btn-ghost text-fg-3")}
        aria-label={idx >= 0 ? `Togli dal percorso: ${text}` : `Aggiungi al percorso: ${text}`} title={idx >= 0 ? "Togli dal percorso" : "Aggiungi al percorso"}>
        <Route size={15} />
      </button>
    </li>
  );
}

function FilterPanel(props: PanelProps & { className?: string; onClose?: () => void }) {
  const { spawns, visible, f, setF, presets, savePresets, routeIds, toggleRoute, focus, selectedId, filtering, resetFilters, onRouteAll, className, onClose, noteNames, canManage, onEditCategories } = props;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const rowProps = { routeIds, toggleRoute, focus, selectedId };

  // Albero razze → manti → punti (tutti i punti, così si possono attivare anche quelli nascosti)
  const tree = useMemo(() => {
    type CoatNode = { key: string; name: string; image: string | null; points: SpawnPoint[] };
    type BreedNode = { key: string; breedId: number | null; name: string; points: SpawnPoint[]; coats: Map<string, CoatNode>; loose: SpawnPoint[] };
    const breeds = new Map<string, BreedNode>();
    const unknown: SpawnPoint[] = [];
    const notes = new Map<string, SpawnPoint[]>();
    const specials = new Map<string, { key: string; kind: Kind; name: string; breed: string | null; image: string | null; points: SpawnPoint[] }>();
    for (const s of spawns) {
      if (f.mine && !s.mine) continue;
      if (s.kind === "NOTA") { const c = noteColor(s); notes.set(c, [...(notes.get(c) ?? []), s]); continue; }
      if (isSpecial(s.kind)) {
        const k = specialKey(s);
        const g = specials.get(k) ?? { key: k, kind: s.kind, name: specialName(s), breed: s.breed, image: s.image, points: [] };
        g.points.push(s);
        specials.set(k, g);
        continue;
      }
      const key = horseKey(s);
      if (key === "p:none") { unknown.push(s); continue; }
      let b = breeds.get(key);
      if (!b) { b = { key, breedId: s.breedId, name: s.breed ?? "Razza sconosciuta", points: [], coats: new Map(), loose: [] }; breeds.set(key, b); }
      b.points.push(s);
      if (s.coatId != null) {
        const ck = `c:${s.coatId}`;
        const c = b.coats.get(ck) ?? { key: ck, name: s.coat ?? "?", image: s.image, points: [] };
        c.points.push(s);
        b.coats.set(ck, c);
      } else b.loose.push(s);
    }
    const list = [...breeds.values()].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ ...b, coatList: [...b.coats.values()].sort((x, y) => x.name.localeCompare(y.name)) }));
    const noteList = [...notes.entries()].map(([color, points]) => ({ color, points })).sort((a, b) => NOTE_COLORS.indexOf(a.color) - NOTE_COLORS.indexOf(b.color));
    const specialList = [...specials.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "LEGGENDARIO" ? -1 : 1));
    return { list, unknown, noteList, specialList };
  }, [spawns, f.mine]);

  const ql = q.trim();
  const matchText = (t: string | null | undefined) => !!t && matchHorse({ breed: t, coat: null }, ql);
  const pointMatch = (s: SpawnPoint) => !ql || matchText(s.location) || matchText(s.title) || matchText(s.description);
  const isOpen = (k: string) => open.has(k) || !!ql;
  const toggleOpen = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const stateOf = (key: string, parent?: string): RowState => {
    if (f.sel.includes(key)) return "sel";
    if (parent && f.sel.includes(parent)) return "inherit";
    return f.sel.length ? "off" : "neutral";
  };
  const toggleBreed = (key: string, coatKeys: string[]) =>
    setF((x) => (x.sel.includes(key) ? { ...x, sel: x.sel.filter((k) => k !== key) } : { ...x, sel: [...x.sel.filter((k) => !coatKeys.includes(k)), key] }));
  const toggleCoat = (key: string, breedKey: string) =>
    setF((x) => {
      if (x.sel.includes(key)) return { ...x, sel: x.sel.filter((k) => k !== key) };
      // razza intera già scelta: si passa a "solo questo manto"
      return { ...x, sel: [...x.sel.filter((k) => k !== breedKey), key] };
    });
  const noteState = (c: string): RowState => (f.notes.includes(c) ? "sel" : f.notes.length ? "off" : "neutral");
  const toggleNote = (c: string) => setF((x) => ({ ...x, notes: x.notes.includes(c) ? x.notes.filter((y) => y !== c) : [...x.notes, c] }));
  const toggleKind = (k: Kind) => setF((x) => ({ ...x, kinds: x.kinds.includes(k) ? x.kinds.filter((y) => y !== k) : [...x.kinds, k] }));

  const savePreset = () => {
    const name = presetName.trim().slice(0, 30);
    if (!name) return;
    const p: Preset = { name, sel: f.sel, notes: f.notes, kinds: f.kinds, mine: f.mine };
    savePresets([...presets.filter((x) => x.name !== name), p].slice(-20));
    setPresetName("");
    setNaming(false);
    toast.success(`Filtro “${name}” salvato.`);
  };
  const applyPreset = (p: Preset) => setF((x) => ({ ...x, sel: p.sel, notes: p.notes, kinds: p.kinds.length ? p.kinds : ALL_KINDS, mine: p.mine }));

  const breeds = tree.list.filter((b) => !ql || matchText(b.name) || b.coatList.some((c) => matchText(c.name)) || b.points.some(pointMatch));
  const notes = tree.noteList.map((n) => ({ ...n, shown: n.points.filter(pointMatch) })).filter((n) => !ql || n.shown.length);
  const unknownShown = tree.unknown.filter(pointMatch);
  const specials = tree.specialList.map((g) => ({ ...g, shown: g.points.filter((p) => !ql || matchText(g.name) || matchText(g.breed) || pointMatch(p)) })).filter((g) => !ql || g.shown.length);
  const toggleSel = (key: string) => setF((x) => ({ ...x, sel: x.sel.includes(key) ? x.sel.filter((k) => k !== key) : [...x.sel, key] }));
  const horsesOff = !f.kinds.includes("CAVALLO") && !f.kinds.includes("POSSIBILE");

  return (
    <div className={clsx("card flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={17} className="shrink-0 text-fg-3" aria-hidden="true" />
          <h3 className="eyebrow flex-1">Filtri · {visible.length} di {spawns.length} visibili</h3>
          {filtering && <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Mostra tutto</button>}
          {onClose && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Chiudi filtri"><X size={16} /></button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_KINDS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={f.kinds.includes(k)} onClick={() => toggleKind(k)}>{KIND_LABEL[k]}</button>
          ))}
          <button type="button" className="chip" aria-pressed={f.mine} onClick={() => setF((x) => ({ ...x, mine: !x.mine }))}>Solo i miei</button>
          <button type="button" className="chip" aria-pressed={f.labels} onClick={() => setF((x) => ({ ...x, labels: !x.labels }))}>Nomi</button>
        </div>
        <label className="input flex items-center gap-2 !py-1.5">
          <Search size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nell'elenco: razza, manto, luogo…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3 focus-visible:!outline-none" aria-label="Cerca nell'elenco" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Svuota ricerca" className="text-fg-3 hover:text-fg"><X size={15} /></button>}
        </label>
        {(presets.length > 0 || filtering) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <span key={p.name} className="inline-flex items-center rounded-full border border-border-strong bg-surface text-[13px]">
                <button type="button" onClick={() => applyPreset(p)} className="inline-flex min-h-8 items-center gap-1.5 pr-1 pl-3 font-medium text-fg-2 hover:text-fg" title="Applica questo filtro">
                  <Bookmark size={13} /> {p.name}
                </button>
                <button type="button" onClick={() => savePresets(presets.filter((x) => x !== p))} className="flex min-h-8 items-center px-2 text-fg-3 hover:text-fg" aria-label={`Elimina filtro salvato ${p.name}`}><X size={13} /></button>
              </span>
            ))}
            {filtering && !naming && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(true)}><Save size={14} /> Salva filtro</button>
            )}
          </div>
        )}
        {naming && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); savePreset(); }}>
            <input autoFocus value={presetName} onChange={(e) => setPresetName(e.target.value)} maxLength={30} placeholder="Nome, es. Arabi del nord" className="input !min-h-9 flex-1" aria-label="Nome del filtro" />
            <button className="btn btn-primary btn-sm" disabled={!presetName.trim()}>Salva</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(false)}>Annulla</button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-3 pt-2.5 pb-1.5 text-[12.5px] leading-snug text-fg-3">
          {f.sel.length || f.notes.length
            ? "Sulla mappa vedi solo gli elementi evidenziati. Tocca per aggiungerne o toglierne."
            : <>Tocca una razza, un manto o un colore per vedere <b className="text-fg-2">solo quello</b>. Con <Route size={12} className="inline align-[-1px]" /> aggiungi un punto al percorso.</>}
        </p>

        {spawns.length === 0 && <p className="p-4 text-fg-3">Nessun punto sulla mappa.</p>}

        {breeds.length > 0 && (
          <section aria-label="Cavalli per razza" className={clsx(horsesOff && "opacity-50")}>
            <h4 className="eyebrow px-3 pt-2 pb-1">Cavalli {horsesOff && "· nascosti"}</h4>
            {breeds.map((b) => {
              const coatKeys = b.coatList.map((c) => c.key);
              const st = stateOf(b.key);
              const color = safeColor(breedColor(b.breedId));
              return (
                <div key={b.key}>
                  <FilterRow
                    state={st === "off" && coatKeys.some((k) => f.sel.includes(k)) ? "inherit" : st}
                    onToggle={() => toggleBreed(b.key, coatKeys)}
                    title={st === "sel" ? "Togli dal filtro" : "Mostra solo questa razza"}
                    lead={<span className="inline-block size-3 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: color }} />}
                    name={b.name}
                    sub={b.coatList.length ? `${b.coatList.length} ${b.coatList.length === 1 ? "manto" : "manti"}` : undefined}
                    count={b.points.length}
                    expanded={isOpen(b.key)}
                    onExpand={() => toggleOpen(b.key)}
                  />
                  {isOpen(b.key) && (
                    <div className="border-l-[3px] border-transparent pb-1">
                      {b.coatList.filter((c) => !ql || matchText(b.name) || matchText(c.name) || c.points.some(pointMatch)).map((c) => (
                        <div key={c.key} className="pl-4">
                          <FilterRow
                            state={stateOf(c.key, b.key)}
                            onToggle={() => toggleCoat(c.key, b.key)}
                            title={f.sel.includes(c.key) ? "Togli dal filtro" : "Mostra solo questo manto"}
                            lead={<HorseThumb src={c.image} size={30} />}
                            name={c.name}
                            count={c.points.length}
                          />
                          <ul>{c.points.filter((s) => !ql || matchText(b.name) || matchText(c.name) || pointMatch(s)).map((s) => <PointRow key={s.id} s={s} text={s.kind === "POSSIBILE" ? `Possibile · ${c.name}` : c.name} {...rowProps} />)}</ul>
                        </div>
                      ))}
                      {b.loose.length > 0 && (
                        <ul className="pl-4">{b.loose.filter((s) => !ql || matchText(b.name) || pointMatch(s)).map((s) => <PointRow key={s.id} s={s} text={s.kind === "POSSIBILE" ? "Possibile · manto da verificare" : "Tutti i manti"} {...rowProps} />)}</ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {tree.unknown.length > 0 && (!ql || unknownShown.length > 0) && (
          <section aria-label="Possibili cavalli da verificare" className={clsx(!f.kinds.includes("POSSIBILE") && "opacity-50")}>
            <h4 className="eyebrow px-3 pt-3 pb-1">Possibili {!f.kinds.includes("POSSIBILE") && "· nascosti"}</h4>
            <FilterRow
              state={stateOf("p:none")}
              onToggle={() => setF((x) => ({ ...x, sel: x.sel.includes("p:none") ? x.sel.filter((k) => k !== "p:none") : [...x.sel, "p:none"] }))}
              title="Mostra solo i possibili cavalli da verificare"
              lead={<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-white/80 bg-[#78716c] text-[11px] font-extrabold text-white">?</span>}
              name="Da verificare"
              count={tree.unknown.length}
              expanded={isOpen("p:none")}
              onExpand={() => toggleOpen("p:none")}
            />
            {isOpen("p:none") && <ul className="pb-1">{unknownShown.map((s) => <PointRow key={s.id} s={s} text="Possibile cavallo" {...rowProps} />)}</ul>}
          </section>
        )}

        {specials.length > 0 && (
          <section aria-label="Cavalli rari e leggendari">
            <h4 className="eyebrow px-3 pt-3 pb-1">Rari e leggendari</h4>
            {specials.map((g) => {
              const off = !f.kinds.includes(g.kind);
              return (
                <div key={g.key} className={clsx(off && "opacity-50")}>
                  <FilterRow
                    state={stateOf(g.key)}
                    onToggle={() => toggleSel(g.key)}
                    title={f.sel.includes(g.key) ? "Togli dal filtro" : "Mostra solo questo"}
                    lead={<span className="inline-flex size-6 shrink-0 items-center justify-center" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerIcon({ kind: g.kind } as SpawnPoint, {}).options.html as string }} />}
                    name={g.name}
                    sub={`${g.kind === "RARO" ? "Raro" : "Leggendario"}${g.breed && g.breed.toLowerCase() !== g.name.toLowerCase() ? " · " + g.breed : ""}${off ? " · nascosti" : ""}`}
                    count={g.points.length}
                    expanded={isOpen(g.key)}
                    onExpand={() => toggleOpen(g.key)}
                  />
                  {isOpen(g.key) && <ul className="pb-1">{g.shown.map((p) => <PointRow key={p.id} s={p} text={label(p)} {...rowProps} />)}</ul>}
                </div>
              );
            })}
          </section>
        )}

        {notes.length > 0 && (
          <section aria-label="Note per colore" className={clsx(!f.kinds.includes("NOTA") && "opacity-50")}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <h4 className="eyebrow">Note per categoria {!f.kinds.includes("NOTA") && "· nascoste"}</h4>
              {canManage && <button type="button" className="btn btn-ghost btn-sm -my-1" onClick={onEditCategories}>Rinomina</button>}
            </div>
            {notes.map((n) => {
              const k = "n:" + n.color;
              return (
                <div key={n.color}>
                  <FilterRow
                    state={noteState(n.color)}
                    onToggle={() => toggleNote(n.color)}
                    title="Mostra solo le note di questo colore"
                    lead={<span className="inline-block size-3.5 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: n.color }} />}
                    name={noteColorName(noteNames, n.color)}
                    sub={n.points.map((p) => p.title).filter(Boolean).slice(0, 3).join(", ") + (n.points.length > 3 ? "…" : "")}
                    count={n.points.length}
                    expanded={isOpen(k)}
                    onExpand={() => toggleOpen(k)}
                  />
                  {isOpen(k) && <ul className="pb-1">{n.shown.map((s) => <PointRow key={s.id} s={s} text={s.title ?? "Nota"} {...rowProps} />)}</ul>}
                </div>
              );
            })}
          </section>
        )}
        {ql && breeds.length === 0 && notes.length === 0 && unknownShown.length === 0 && <p className="p-4 text-fg-3">Niente trovato per “{q}”.</p>}
        <div className="h-2" />
      </div>

      {visible.length > 1 && (
        <div className="border-t border-border p-2">
          <button type="button" className="btn btn-ghost btn-sm w-full" onClick={onRouteAll} title="Crea un percorso che tocca tutti i punti visibili, nell'ordine dell'elenco">
            <Route size={15} /> Percorso con i {visible.length} punti visibili
          </button>
        </div>
      )}
    </div>
  );
}

function CategoriesModal({ open, onClose, names }: { open: boolean; onClose: () => void; names: Record<string, string> }) {
  const router = useRouter();
  return (
    <Modal open={open} onClose={onClose} title="Categorie delle note">
      <ActionForm action={saveNoteNames} onSuccess={() => { onClose(); router.refresh(); }} className="space-y-3">
        <p className="text-[14px] text-fg-2">Dai un nome a ogni colore, per esempio <b>Pericolo</b>, <b>Accampamento</b>, <b>Abbeveratoio</b>. Lo vedranno tutti nei filtri e quando creano una nota. Lascia vuoto per usare il nome del colore.</p>
        {NOTE_COLORS.map((c, i) => (
          <label key={c} className="flex items-center gap-3">
            <span className="inline-block size-7 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: c }} aria-hidden="true" />
            <input name={"n" + c.slice(1)} defaultValue={names[c] ?? ""} maxLength={24} placeholder={NOTE_COLOR_DEFAULT_NAMES[i]} className="input flex-1" aria-label={`Nome per il colore ${NOTE_COLOR_DEFAULT_NAMES[i]}`} />
          </label>
        ))}
        <button className="btn btn-primary w-full">Salva categorie</button>
      </ActionForm>
    </Modal>
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
        {s.kind === "NOTA" ? <span className="mt-1 inline-block size-4 rounded-full" style={{ background: safeColor(pointColor(s)) }} /> : isSpecial(s.kind) && !s.image ? <Legend kind={s.kind} /> : <HorseThumb src={s.image} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="eyebrow" style={isSpecial(s.kind) ? { color: pointColor(s) } : undefined}>
            {s.kind === "NOTA" ? "Nota" : s.kind === "POSSIBILE" ? "Possibile cavallo" : s.kind === "RARO" ? "Cavallo raro" : s.kind === "LEGGENDARIO" ? "Cavallo leggendario" : "Cavallo"}
          </div>
          <h3 className="text-[17px] font-semibold">{s.kind === "NOTA" ? s.title : isSpecial(s.kind) ? specialName(s) : s.breed ?? "Da verificare"}</h3>
          {isSpecial(s.kind) && s.title && s.breed && <div className="text-fg-3">{s.breed}{s.coat ? ` · ${s.coat}` : ""}</div>}
          {!isSpecial(s.kind) && s.kind !== "NOTA" && s.coat && <div className="text-fg-3">{s.coat}</div>}
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

function PointFormModal({ open, title, options, point, initial, action, onClose, onDone, noteNames }: {
  open: boolean; title: string; noteNames: Record<string, string>; options: HorseOption[]; point: { x: number; y: number } | null; initial?: SpawnPoint;
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
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1 sm:grid-cols-5" role="radiogroup" aria-label="Tipo di punto">
          {([["CAVALLO", "Cavallo"], ["POSSIBILE", "Possibile ?"], ["RARO", "Raro"], ["LEGGENDARIO", "Leggendario"], ["NOTA", "Nota"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={clsx("min-h-10 rounded-md text-[14px] font-semibold transition-colors", kind === k ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>{l}</button>
          ))}
        </div>
        {kind === "NOTA" ? (
          <>
            <label className="block"><span className="field-label">Titolo *</span><input name="title" defaultValue={initial?.title ?? ""} className="input" required maxLength={80} placeholder="Es. Accampamento, abbeveratoio, pericolo…" /></label>
            <div>
              <span className="field-label">Categoria · <b className="text-fg">{noteColorName(noteNames, color)}</b></span>
              <input type="hidden" name="color" value={color} />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colore">
                {NOTE_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={noteColorName(noteNames, c)} title={noteColorName(noteNames, c)} onClick={() => setColor(c)}
                    className={clsx("size-9 rounded-full border-2 transition-transform", color === c ? "scale-110 border-fg" : "border-transparent")} style={{ background: c }} />
                ))}
              </div>
            </div>
          </>
        ) : isSpecial(kind) ? (
          <>
            <label className="block">
              <span className="field-label">Nome del cavallo {kind === "RARO" ? "raro" : "leggendario"}</span>
              <input name="title" defaultValue={initial && isSpecial(initial.kind) ? initial.title ?? "" : ""} className="input" maxLength={80}
                placeholder={kind === "RARO" ? "Es. Arabo bianco, Appaloosa del nord…" : "Es. Cavallo leggendario del lago, Mustang fantasma…"} />
            </label>
            <HorsePicker
              label="Razza dal catalogo (facoltativa)"
              options={options}
              value={value}
              placeholder="Cerca razza o manto…"
            />
            <p className="text-[13px] text-fg-3">Scrivi un nome, scegli una razza, o entrambi. Nei filtri i punti con lo stesso nome vengono raggruppati.</p>
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
