"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Move, Loader2 } from "lucide-react";
import { generateMapTiles, getMapJobStatus } from "./actions";

const W = 2000;
const H = 1556;
type Cal = { x: number; y: number; s: number };

const QUALITY = [
  { k: 1, label: "Media", px: 4000 },
  { k: 2, label: "Alta", px: 8000 },
  { k: 3, label: "Massima", px: 16000 },
];

/**
 * Allineamento della nuova immagine sulla mappa attuale: la nuova è sovrapposta in trasparenza,
 * si trascina e si ridimensiona finché strade e coste combaciano. I punti già salvati sono i pallini rossi.
 */
export function MapCalibrator({ hasPreview, source, initial, suggestedK, points, running }: {
  hasPreview: boolean; source: { width: number; height: number; mtime: number } | null; initial: Cal | null;
  suggestedK: number; points: { x: number; y: number }[]; running: boolean;
}) {
  const router = useRouter();
  const [cal, setCal] = useState<Cal | null>(initial);
  const [opacity, setOpacity] = useState(60);
  const [k, setK] = useState(Math.max(1, suggestedK));
  const [uploading, setUploading] = useState<number | null>(null);
  const [job, setJob] = useState<{ state: string; message: string } | null>(running ? { state: "running", message: "Generazione in corso…" } : null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; cal: Cal } | null>(null);

  useEffect(() => setCal(initial), [initial]);
  useEffect(() => setK(Math.max(1, suggestedK)), [suggestedK]);

  // Controllo dello stato mentre la generazione è in corso
  useEffect(() => {
    if (job?.state !== "running") return;
    const t = setInterval(async () => {
      const s = await getMapJobStatus();
      setJob(s);
      if (s.state === "done") { toast.success(s.message); router.refresh(); }
      if (s.state === "error") toast.error(s.message);
    }, 2000);
    return () => clearInterval(t);
  }, [job?.state, router]);

  const upload = (file: File) => {
    setUploading(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/mappa/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && setUploading(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setUploading(null);
      let r: { ok?: boolean; error?: string } = {};
      try { r = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 413 && !r.error) r.error = "Il file supera il limite del proxy (nginx): alza client_max_body_size o copia il file nella cartella (vedi sotto).";
      if (r.ok) { toast.success("Immagine caricata: ora allineala e genera la mappa."); setCal(null); router.refresh(); }
      else toast.error(r.error || "Caricamento non riuscito.");
    };
    xhr.onerror = () => { setUploading(null); toast.error("Caricamento interrotto."); };
    xhr.send(file);
  };

  const unitsPerPx = () => W / (boxRef.current?.clientWidth || W);
  const onDown = (e: React.PointerEvent) => {
    if (!cal) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, cal };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const u = unitsPerPx();
    setCal({ ...d.cal, x: round(d.cal.x + (e.clientX - d.px) * u), y: round(d.cal.y + (e.clientY - d.py) * u) });
  };
  const onUp = () => { drag.current = null; };

  const ratio = source ? source.height / source.width : H / W;
  const fitW = () => setCal({ s: W, x: 0, y: round((H - W * ratio) / 2) });
  const fitH = () => { const s = round(H / ratio); setCal({ s, y: 0, x: round((W - s) / 2) }); };
  const scaleBy = (f: number) => cal && setCal({ s: round(cal.s * f), x: round(cal.x + (cal.s - cal.s * f) / 2), y: round(cal.y + ((cal.s - cal.s * f) * ratio) / 2) });
  const nudge = (dx: number, dy: number) => cal && setCal({ ...cal, x: round(cal.x + dx), y: round(cal.y + dy) });

  // qualità massima = risoluzione vera dell'immagine (ingrandirla non aggiunge dettagli)
  const maxK = source && cal ? Math.max(0, Math.min(3, Math.floor(Math.log2(source.width / cal.s) + 0.15))) : 0;
  useEffect(() => { if (k > maxK && maxK >= 1) setK(maxK); }, [k, maxK]);
  const generate = async () => {
    if (!cal) return;
    const r = await generateMapTiles(cal, k);
    if (r.ok) { toast.success(r.message ?? "Avviata."); setJob({ state: "running", message: "Generazione in corso…" }); }
    else toast.error(r.error ?? "Errore.");
  };

  return (
    <div className="card card-pad space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="h-display text-[20px]">1 · Carica l&apos;immagine</h3>
          <p className="text-[14px] text-fg-3">JPG, PNG, WEBP o TIFF, almeno 4.000 px di larghezza (consigliati 8.000–16.000). La stessa mappa di adesso, solo più definita.</p>
        </div>
        <label className="btn btn-primary cursor-pointer">
          {uploading != null ? <><Loader2 size={17} className="animate-spin" /> {uploading}%</> : <><Upload size={17} /> Scegli immagine</>}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/tiff" className="sr-only" disabled={uploading != null || job?.state === "running"}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </label>
      </div>

      {hasPreview && source && cal && (
        <>
          <div className="border-t border-border pt-4">
            <h3 className="h-display text-[20px]">2 · Allinea alla mappa attuale</h3>
            <p className="text-[14px] text-fg-3">
              La nuova immagine è sovrapposta in trasparenza. <b className="text-fg-2">Trascinala</b> e ingrandiscila finché coste e fiumi combaciano: così i punti già salvati (pallini rossi) restano al loro posto.
              Se è esattamente la stessa mappa, basta “Adatta in larghezza”.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={fitW}>Adatta in larghezza</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={fitH}>Adatta in altezza</button>
            <span className="mx-1 h-6 w-px bg-border" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => scaleBy(1 / 1.01)} aria-label="Rimpicciolisci">−1%</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => scaleBy(1.01)} aria-label="Ingrandisci">+1%</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => scaleBy(1 / 1.001)}>−0,1%</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => scaleBy(1.001)}>+0,1%</button>
            <span className="mx-1 h-6 w-px bg-border" />
            {([["←", -1, 0], ["→", 1, 0], ["↑", 0, -1], ["↓", 0, 1]] as const).map(([l, dx, dy]) => (
              <button key={l} type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => nudge(dx, dy)} aria-label={`Sposta ${l}`}>{l}</button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-[14px]">
              Trasparenza
              <input type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} aria-label="Trasparenza della nuova immagine" />
            </label>
          </div>

          <div
            ref={boxRef}
            className="relative w-full touch-none overflow-hidden rounded-lg border border-border bg-[#d4b98a] select-none"
            style={{ aspectRatio: `${W} / ${H}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/map/rdr2-map.jpg" alt="Mappa attuale" className="absolute inset-0 h-full w-full" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/mappa/anteprima?v=${source.mtime}`}
              alt="Nuova mappa"
              draggable={false}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              className="absolute max-w-none cursor-move"
              style={{ left: `${(cal.x / W) * 100}%`, top: `${(cal.y / H) * 100}%`, width: `${(cal.s / W) * 100}%`, opacity: opacity / 100 }}
            />
            {points.map((p, i) => (
              <span key={i} className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8161d] ring-2 ring-white"
                style={{ left: `${(p.x / W) * 100}%`, top: `${((H - p.y) / H) * 100}%` }} />
            ))}
            <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-[#0b0a09]/80 px-2 py-1 text-[12.5px] font-semibold text-white">
              <Move size={14} /> Trascina la nuova immagine
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["x", "y", "s"] as const).map((key) => (
              <label key={key} className="block">
                <span className="field-label">{key === "x" ? "Spostamento orizzontale" : key === "y" ? "Spostamento verticale" : "Larghezza (unità mappa, 2000 = uguale)"}</span>
                <input type="number" step="any" className="input" value={cal[key]} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setCal({ ...cal, [key]: v }); }} />
              </label>
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="h-display text-[20px]">3 · Genera la mappa</h3>
            <p className="mb-3 text-[14px] text-fg-3">Più qualità vuol dire più zoom senza sgranare, ma più spazio su disco. Le qualità oltre la risoluzione della tua immagine non sono disponibili.</p>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Qualità">
              {QUALITY.map((q) => (
                <button key={q.k} type="button" role="radio" aria-checked={k === q.k} disabled={q.k > maxK} onClick={() => setK(q.k)}
                  className={k === q.k ? "chip !border-fg !bg-fg !text-bg" : "chip disabled:cursor-not-allowed disabled:opacity-40"}>
                  {q.label} · {q.px.toLocaleString("it-IT")} px
                </button>
              ))}
              <button type="button" className="btn btn-primary ml-auto" onClick={generate} disabled={job?.state === "running" || maxK < 1 || k > maxK}>
                {job?.state === "running" ? <><Loader2 size={17} className="animate-spin" /> Generazione…</> : "Genera mappa"}
              </button>
            </div>
            {maxK < 1 && <p className="mt-3 text-[14px] text-accent-text">Questa immagine ha la stessa definizione della mappa attuale ({source.width.toLocaleString("it-IT")} px): non migliorerebbe nulla. Carica un&apos;immagine di almeno 4.000 px di larghezza.</p>}
            {job && job.state !== "idle" && <p className={job.state === "error" ? "mt-3 text-[14px] text-accent-text" : "mt-3 text-[14px] text-fg-2"}>{job.message}</p>}
          </div>
        </>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
