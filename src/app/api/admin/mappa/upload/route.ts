import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, rename } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { MAP_DIR, SOURCE_BASENAME, makePreview, mapJob } from "@/lib/map-tiles";

// Escluso dal middleware (che leggerebbe solo i primi 10 MB del corpo): i controlli sono qui.
const MAX = 300 * 1024 * 1024;
const EXT: Record<string, string> = { jpeg: ".jpg", png: ".png", webp: ".webp", tiff: ".tif" };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "settings.manage")) return Response.json({ error: "Non autorizzato" }, { status: 403 });
  if (mapJob().state === "running") return Response.json({ error: "Attendi la fine della generazione in corso." }, { status: 409 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX) return Response.json({ error: "File troppo grande (massimo 300 MB)." }, { status: 413 });
  if (!req.body) return Response.json({ error: "Nessun file." }, { status: 400 });

  await mkdir(MAP_DIR, { recursive: true });
  const tmp = path.join(MAP_DIR, "caricamento.tmp");
  let n = 0;
  try {
    const limit = new Transform({
      transform(chunk, _e, cb) {
        n += chunk.length;
        cb(n > MAX ? new Error("troppo grande") : null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), limit, createWriteStream(tmp));
    const meta = await sharp(tmp, { limitInputPixels: false }).metadata();
    const ext = meta.format ? EXT[meta.format] : undefined;
    if (!ext || !meta.width || !meta.height) throw new Error("formato");
    if (meta.width < 4000) {
      await rm(tmp, { force: true });
      return Response.json({ error: `Immagine troppo piccola (${meta.width} × ${meta.height} px): è la stessa definizione della mappa attuale. Per non sgranare serve un'immagine di almeno 4.000 px di larghezza (meglio 8.000–16.000).` }, { status: 400 });
    }
    for (const f of await readdir(MAP_DIR)) if (f.startsWith(SOURCE_BASENAME + ".")) await rm(path.join(MAP_DIR, f), { force: true });
    await rename(tmp, path.join(MAP_DIR, SOURCE_BASENAME + ext));
    await makePreview();
    await audit(user, "MAPPA_CARICATA", "Mappa", null, `Caricata immagine della mappa ${meta.width}×${meta.height} px`);
    return Response.json({ ok: true, width: meta.width, height: meta.height });
  } catch (e) {
    await rm(tmp, { force: true });
    const big = e instanceof Error && e.message === "troppo grande";
    if (!big) console.error("[mappa upload]", e);
    return Response.json({ error: big ? "File troppo grande (massimo 300 MB)." : "File non valido: usa un'immagine JPG, PNG, WEBP o TIFF." }, { status: 400 });
  }
}
