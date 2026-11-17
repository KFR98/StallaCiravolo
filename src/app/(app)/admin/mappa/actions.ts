"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { run, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { startGeneration, mapJob, disableTiles, makePreview, sourceInfo, nativeZoomFor, MAP_W, MAP_H } from "@/lib/map-tiles";

export async function generateMapTiles(cal: { x: number; y: number; s: number }, k: number) {
  return run(async () => {
    const user = await assertPermission("settings.manage");
    const c = z
      .object({ x: z.number().min(-MAP_W * 4).max(MAP_W * 4), y: z.number().min(-MAP_H * 4).max(MAP_H * 4), s: z.number().min(200).max(MAP_W * 8) })
      .parse(cal);
    const q = z.number().int().min(0).max(3).parse(k);
    const src = await sourceInfo();
    if (!src) throw new UserError("Carica prima un'immagine della mappa.");
    if (q > nativeZoomFor(src.width, c) || q < 1) throw new UserError("Qualità troppo alta per questa immagine: ingrandirla non aggiunge dettagli. Serve un'immagine più grande.");
    try {
      startGeneration(c, q);
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Impossibile avviare la generazione.");
    }
    await audit(user, "MAPPA_GENERATA", "Mappa", null, `Avviata la generazione della mappa ad alta definizione (${MAP_W * 2 ** q} px)`, { ...c, k: q });
    return { ok: true, message: "Generazione avviata: ci vuole qualche minuto." };
  });
}

export async function getMapJobStatus() {
  await assertPermission("settings.manage");
  const j = mapJob();
  if (j.state === "done") revalidatePath("/mappa");
  return { state: j.state, message: j.message };
}

export async function disableMapTiles() {
  return run(async () => {
    const user = await assertPermission("settings.manage");
    if (mapJob().state === "running") throw new UserError("Attendi la fine della generazione in corso.");
    await disableTiles();
    await audit(user, "MAPPA_SEMPLICE", "Mappa", null, "Tornati alla mappa semplice (immagine unica)");
    revalidatePath("/mappa");
    return { ok: true, message: "Ora la mappa usa di nuovo l'immagine semplice." };
  });
}

/** Per chi ha copiato l'immagine a mano nella cartella dati/mappa (file manager di Pterodactyl). */
export async function rescanMapSource() {
  return run(async () => {
    await assertPermission("settings.manage");
    if (!(await sourceInfo())) throw new UserError("Nessuna immagine trovata nella cartella della mappa.");
    await makePreview();
    revalidatePath("/admin/mappa");
    return { ok: true, message: "Immagine trovata." };
  });
}
