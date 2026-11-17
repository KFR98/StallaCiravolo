import "server-only";
import path from "node:path";
import { mkdir, readdir, rm, stat, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { prisma } from "./db";
import { UPLOAD_DIR } from "./uploads";

/**
 * Mappa in alta definizione a "tile" (tasselli da 256 px, come Google Maps).
 * L'admin carica un'immagine grande della mappa; il server la allinea al riquadro
 * della mappa attuale (2000×1556 unità, dove sono salvati tutti i punti) e genera i tasselli
 * per ogni livello di zoom. Così il browser scarica solo i pezzi visibili e allo zoom massimo
 * ogni pixel dello schermo è un pixel vero dell'immagine: niente sgranature.
 */

export const MAP_W = 2000;
export const MAP_H = 1556;
export const MAP_DIR = path.resolve(process.env.MAP_DIR || path.join(UPLOAD_DIR, "..", "mappa"));
export const MAP_BG = "#d4b98a";
/** Sorgente caricata dall'admin (o copiata a mano nella cartella da Pterodactyl) */
export const SOURCE_BASENAME = "sorgente";
const PREVIEW = path.join(MAP_DIR, "anteprima.jpg");

export type MapTilesMeta = {
  /** versione (cambia a ogni generazione: invalida la cache del browser) */
  v: string;
  /** zoom Leaflet a cui l'immagine è nativa (1 pixel = 1 pixel): 2 → 8000 px, 3 → 16000 px */
  k: number;
  /** differenza tra livello dei file e zoom di Leaflet */
  offset: number;
};

export type Calibration = { x: number; y: number; s: number };

const SOURCE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];

/**
 * Immagine sorgente: la PIÙ RECENTE tra quelle nella cartella (caricata dal sito o copiata a mano
 * con il file manager di Pterodactyl). Così un file nuovo vince sempre su quello vecchio.
 */
export async function findSource(): Promise<string | null> {
  if (!existsSync(MAP_DIR)) return null;
  const files = (await readdir(MAP_DIR)).filter((f) => SOURCE_EXT.includes(path.extname(f).toLowerCase()) && f !== "anteprima.jpg" && !f.endsWith(".tmp"));
  if (!files.length) return null;
  const withTime = await Promise.all(files.map(async (f) => ({ f, t: (await stat(path.join(MAP_DIR, f))).mtimeMs })));
  withTime.sort((a, b) => b.t - a.t);
  return path.join(MAP_DIR, withTime[0].f);
}

/** File presenti nella cartella che il sito non sa leggere (es. .dds delle mod): per avvisare l'admin. */
export async function unsupportedFiles(): Promise<string[]> {
  if (!existsSync(MAP_DIR)) return [];
  return (await readdir(MAP_DIR)).filter((f) => {
    const e = path.extname(f).toLowerCase();
    return !!e && !SOURCE_EXT.includes(e) && ![".tmp", ".xml"].includes(e) && !f.startsWith("tiles-");
  });
}

export async function sourceInfo() {
  const src = await findSource();
  if (!src) return null;
  try {
    const [m, st] = await Promise.all([sharp(src, { limitInputPixels: false }).metadata(), stat(src)]);
    if (!m.width || !m.height) return null;
    return { file: path.basename(src), width: m.width, height: m.height, size: st.size, mtime: st.mtimeMs, error: null as string | null };
  } catch {
    const st = await stat(src);
    return { file: path.basename(src), width: 0, height: 0, size: st.size, mtime: st.mtimeMs, error: "File non leggibile: salvalo di nuovo come JPG o PNG." };
  }
}

/** Anteprima leggera (2000 px) della sorgente, usata per l'allineamento nel browser. */
export async function makePreview() {
  const src = await findSource();
  if (!src) throw new Error("Nessuna immagine caricata.");
  await mkdir(MAP_DIR, { recursive: true });
  await sharp(src, { limitInputPixels: false }).rotate().resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(PREVIEW + ".tmp");
  await rename(PREVIEW + ".tmp", PREVIEW);
}

export const previewPath = () => (existsSync(PREVIEW) ? PREVIEW : null);

/** Rigenera l'anteprima se manca o se l'immagine sorgente è più nuova (es. file copiato a mano). */
export async function ensurePreview(): Promise<boolean> {
  const src = await findSource();
  if (!src) return false;
  const srcTime = (await stat(src)).mtimeMs;
  const prevTime = existsSync(PREVIEW) ? (await stat(PREVIEW)).mtimeMs : 0;
  if (prevTime >= srcTime) return true;
  try {
    await makePreview();
    return true;
  } catch (e) {
    console.error("[mappa anteprima]", e);
    return false;
  }
}

/** Calibrazione predefinita: immagine larga quanto la mappa, centrata in verticale. */
export function defaultCalibration(width: number, height: number): Calibration {
  const s = MAP_W;
  return { x: 0, y: Math.round(((MAP_H - (s * height) / width) / 2) * 10) / 10, s };
}

/** Zoom nativo massimo sensato per questa sorgente (2 = 8000 px, 3 = 16000 px). */
export function nativeZoomFor(width: number, cal: Calibration) {
  const pxPerUnit = width / cal.s;
  return Math.max(0, Math.min(3, Math.floor(Math.log2(pxPerUnit) + 0.15)));
}

/* ───────── Stato della generazione (una per volta, in memoria) ───────── */
type Job = { state: "idle" | "running" | "done" | "error"; message: string; startedAt?: number };
const g = globalThis as unknown as { __mapJob?: Job };
export const mapJob = (): Job => (g.__mapJob ??= { state: "idle", message: "" });

export async function getTilesMeta(): Promise<MapTilesMeta | null> {
  const row = await prisma.setting.findUnique({ where: { key: "mapTiles" } });
  if (!row) return null;
  try {
    const m = JSON.parse(row.value) as MapTilesMeta;
    if (!m || typeof m.v !== "string" || !/^[a-z0-9]+$/.test(m.v) || !existsSync(path.join(MAP_DIR, "tiles-" + m.v))) return null;
    return m;
  } catch {
    return null;
  }
}

/** Genera i tasselli in background. Ritorna subito; lo stato si legge con mapJob(). */
export function startGeneration(cal: Calibration, k: number) {
  const job = mapJob();
  if (job.state === "running") throw new Error("Una generazione è già in corso.");
  Object.assign(job, { state: "running", message: "Preparazione…", startedAt: Date.now() });
  void generate(cal, k).then(
    () => Object.assign(job, { state: "done", message: "Mappa in alta definizione pronta." }),
    (e) => {
      console.error("[mappa]", e);
      Object.assign(job, { state: "error", message: "Generazione non riuscita: " + (e instanceof Error ? e.message : "errore sconosciuto") });
    },
  );
}

async function generate(cal: Calibration, k: number) {
  const src = await findSource();
  if (!src) throw new Error("nessuna immagine caricata");
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  if (!meta.width || !meta.height) throw new Error("immagine non leggibile");
  const sc = 2 ** k;
  const W2 = MAP_W * sc;
  const H2 = MAP_H * sc;
  // dimensione e posizione della sorgente sulla tela finale
  const tw = Math.max(1, Math.round(cal.s * sc));
  const th = Math.max(1, Math.round((cal.s * sc * meta.height) / meta.width));
  const left = Math.round(cal.x * sc);
  const top = Math.round(cal.y * sc);
  // parte visibile della sorgente ridimensionata
  const ex = Math.max(0, -left), ey = Math.max(0, -top);
  const ew = Math.min(tw - ex, W2 - Math.max(0, left));
  const eh = Math.min(th - ey, H2 - Math.max(0, top));
  if (ew <= 0 || eh <= 0) throw new Error("l'immagine è fuori dal riquadro della mappa: controlla l'allineamento");

  const v = Date.now().toString(36);
  const out = path.join(MAP_DIR, "tiles-" + v);
  const tmp = out + ".tmp";
  await rm(tmp, { recursive: true, force: true });
  mapJob().message = `Creazione dei tasselli (${W2.toLocaleString("it-IT")} × ${H2.toLocaleString("it-IT")} px)…`;

  await sharp(src, { limitInputPixels: false })
    .rotate()
    .resize(tw, th, { fit: "fill", kernel: "lanczos3" })
    .extract({ left: ex, top: ey, width: ew, height: eh })
    .extend({
      left: Math.max(0, left), top: Math.max(0, top),
      right: W2 - Math.max(0, left) - ew, bottom: H2 - Math.max(0, top) - eh,
      background: MAP_BG,
    })
    .flatten({ background: MAP_BG })
    .jpeg({ quality: 82, mozjpeg: true })
    .tile({ size: 256, layout: "google", background: MAP_BG, skipBlanks: -1 })
    .toFile(tmp);
  await rename(tmp, out);

  // livello massimo prodotto = zoom nativo k
  const levels = (await readdir(out)).filter((d) => /^\d+$/.test(d)).map(Number);
  const maxLevel = Math.max(...levels);
  const m: MapTilesMeta = { v, k, offset: maxLevel - k };
  await prisma.setting.upsert({ where: { key: "mapTiles" }, create: { key: "mapTiles", value: JSON.stringify(m) }, update: { value: JSON.stringify(m) } });
  const st = await stat(src);
  const savedCal = JSON.stringify({ ...cal, file: path.basename(src), mtime: st.mtimeMs });
  await prisma.setting.upsert({ where: { key: "mapCalibration" }, create: { key: "mapCalibration", value: savedCal }, update: { value: savedCal } });

  // elimina le versioni precedenti
  for (const d of await readdir(MAP_DIR)) {
    if (d.startsWith("tiles-") && d !== "tiles-" + v) await rm(path.join(MAP_DIR, d), { recursive: true, force: true });
  }
}

export async function getSavedCalibration(): Promise<(Calibration & { file?: string; mtime?: number }) | null> {
  const row = await prisma.setting.findUnique({ where: { key: "mapCalibration" } });
  if (!row) return null;
  try {
    const c = JSON.parse(row.value);
    return [c?.x, c?.y, c?.s].every((n) => typeof n === "number" && Number.isFinite(n)) ? c : null;
  } catch {
    return null;
  }
}

/** Torna alla mappa semplice (immagine unica). I tasselli vengono eliminati. */
export async function disableTiles() {
  await prisma.setting.deleteMany({ where: { key: "mapTiles" } });
  if (!existsSync(MAP_DIR)) return;
  for (const d of await readdir(MAP_DIR)) if (d.startsWith("tiles-")) await rm(path.join(MAP_DIR, d), { recursive: true, force: true });
}

/** Percorso di un tassello, con controllo rigoroso dei parametri (niente path traversal). */
export function tilePath(v: string, z: string, y: string, x: string) {
  if (!/^[a-z0-9]{1,16}$/.test(v) || ![z, y, x].every((n) => /^\d{1,4}$/.test(n))) return null;
  return path.join(MAP_DIR, "tiles-" + v, z, y, x + ".jpg");
}
