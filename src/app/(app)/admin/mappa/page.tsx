import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { ActionButton } from "@/components/ActionForm";
import { AdminTabs } from "../AdminTabs";
import { sourceInfo, ensurePreview, unsupportedFiles, getTilesMeta, getSavedCalibration, defaultCalibration, nativeZoomFor, previewPath, MAP_DIR, MAP_W, mapJob } from "@/lib/map-tiles";
import { MapCalibrator } from "./MapCalibrator";
import { disableMapTiles, rescanMapSource, saveMapExtraZoom } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Mappa ad alta definizione" };
export const dynamic = "force-dynamic";

export default async function AdminMapPage() {
  const me = await requireUser("settings.manage");
  await ensurePreview();
  const [srcInfo, tiles, saved, spawns, extra, unsupported] = await Promise.all([
    sourceInfo(),
    getTilesMeta(),
    getSavedCalibration(),
    prisma.spawn.findMany({ select: { x: true, y: true } }),
    getSetting("mapExtraZoom"),
    unsupportedFiles(),
  ]);
  const src = srcInfo && !srcInfo.error ? srcInfo : null;
  // la calibrazione salvata vale solo per l'immagine con cui è stata fatta: con un file nuovo si riparte
  const sameSource = !!(saved && src && saved.file === src.file && saved.mtime === src.mtime);
  const cal = sameSource && saved ? { x: saved.x, y: saved.y, s: saved.s } : src ? defaultCalibration(src.width, src.height) : null;
  const job = mapJob();
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Mappa degli spawn in alta definizione: niente sgranature allo zoom massimo." />
      <AdminTabs role={me.role} active="mappa" />
      <div className="space-y-5">
        <Card title="Stato">
          <ul className="space-y-1.5 text-[15px]">
            <li>
              Mappa in uso:{" "}
              {tiles ? <b>alta definizione · {(MAP_W * 2 ** tiles.k).toLocaleString("it-IT")} px di larghezza</b> : <b>immagine semplice (2.000 px, sgrana zoomando)</b>}
            </li>
            {srcInfo?.error && <li className="text-accent-text">{srcInfo.file}: {srcInfo.error}</li>}
            {unsupported.length > 0 && (
              <li className="text-accent-text">
                File ignorati perché in un formato non supportato: {unsupported.join(", ")}. Aprili con un programma di grafica (es. GIMP, Paint.NET) e salvali come PNG o JPG.
              </li>
            )}
            <li>
              Immagine in uso per la generazione: {src ? <b>{src.file} · {src.width.toLocaleString("it-IT")} × {src.height.toLocaleString("it-IT")} px · {(src.size / 1048576).toFixed(1)} MB</b> : <span className="text-fg-3">nessuna</span>}
            </li>
          </ul>
          {tiles && (
            <ActionForm action={saveMapExtraZoom} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <label className="block">
                <span className="field-label">Zoom oltre la risoluzione dell&apos;immagine</span>
                <select name="extra" defaultValue={String(extra)} className="input">
                  <option value="0">Nessuno: si ferma quando 1 pixel = 1 pixel (massima nitidezza)</option>
                  <option value="1">1 livello in più: ingrandimento ×2, morbido</option>
                  <option value="2">2 livelli in più: ingrandimento ×4, morbido</option>
                </select>
              </label>
              <button className="btn btn-secondary">Salva</button>
            </ActionForm>
          )}
          {tiles && (
            <div className="mt-3">
              <ActionButton action={disableMapTiles} label="Torna alla mappa semplice" className="btn btn-ghost btn-sm" confirm="Tornare all'immagine semplice? I tasselli ad alta definizione verranno eliminati (l'immagine caricata resta)." />
            </div>
          )}
        </Card>

        <MapCalibrator
          hasPreview={!!previewPath()}
          source={src ? { width: src.width, height: src.height, mtime: src.mtime } : null}
          initial={cal}
          suggestedK={src && cal ? nativeZoomFor(src.width, cal) : 2}
          points={spawns}
          running={job.state === "running"}
        />

        <Card title="Immagine molto grande?">
          <p className="text-[14.5px] text-fg-2">
            Se il caricamento dal sito non riesce (file oltre i limiti del proxy), copia l&apos;immagine con il file manager di Pterodactyl nella cartella
            {" "}<code className="rounded bg-surface-3 px-1.5 py-0.5 text-[13px]">{MAP_DIR.replace(/^.*?(data[\\/])/, "$1")}</code>{" "}
            del server della stalla e premi il pulsante qui sotto.
          </p>
          <div className="mt-3"><ActionButton action={rescanMapSource} label="Cerca l'immagine nella cartella" className="btn btn-secondary btn-sm" /></div>
        </Card>
      </div>
    </>
  );
}
