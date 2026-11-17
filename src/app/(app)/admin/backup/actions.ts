"use server";

import { assertPermission } from "@/lib/auth";
import { run, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { writeBackup, restoreBackup, pruneBackups, type BackupFile } from "@/lib/backup";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function makeBackup() {
  return run(async () => {
    const user = await assertPermission("data.backup");
    const r = await writeBackup("manuale");
    await pruneBackups((await getSettings()).backupDays);
    await audit(user, "BACKUP", "Backup", null, `Creato backup ${r.file}`);
    return { ok: true, message: `Backup creato: ${r.file}` };
  });
}

export async function restoreFromFile(form: FormData) {
  return run(async () => {
    const user = await assertPermission("data.backup");
    if (form.get("conferma") !== "RIPRISTINA") throw new UserError('Scrivi RIPRISTINA per confermare.');
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Seleziona il file di backup.");
    let data: BackupFile;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new UserError("Il file non è un backup valido.");
    }
    // Copia di sicurezza dello stato attuale prima del ripristino
    const safety = await writeBackup("pre-ripristino");
    try {
      await restoreBackup(data);
    } catch (e) {
      throw new UserError("Ripristino fallito, nessun dato modificato: " + (e as Error).message);
    }
    await audit(null, "RIPRISTINO", "Backup", null, `Database ripristinato da ${file.name} (eseguito da ${user.username}; copia precedente: ${safety.file})`);
    return { ok: true, message: "Ripristino completato. Effettua di nuovo l'accesso.", redirect: "/login" };
  });
}

/**
 * Azzeramento dei dati di gioco (es. dopo il reset del server RedM).
 * Restano: utenti, catalogo, prezzi, impostazioni, bottega (oggetti e fornitori), registro attività.
 * Prima di cancellare viene sempre creato un backup.
 */
const WIPE_PARTS = ["stalla", "oggetti", "stipendi", "rimborsi", "prenotazioni", "noteBottega", "mappa"] as const;

export async function wipeGameData(form: FormData) {
  return run(async () => {
    const user = await assertPermission("settings.manage");
    if (String(form.get("conferma") ?? "").trim() !== "AZZERA") throw new UserError("Scrivi AZZERA per confermare.");
    const parts = WIPE_PARTS.filter((p) => form.get(p) === "on");
    if (!parts.length) throw new UserError("Scegli almeno una cosa da azzerare.");
    const backup = await writeBackup("prima-azzeramento");
    const counts: Record<string, number> = {};
    await prisma.$transaction(async (tx) => {
      if (parts.includes("oggetti")) {
        counts.righeOggetti = (await tx.itemSaleLine.deleteMany()).count;
        counts.venditeOggetti = (await tx.itemSale.deleteMany()).count;
      }
      if (parts.includes("stipendi")) {
        counts.pagamenti = (await tx.payment.deleteMany()).count;
        counts.settimane = (await tx.payrollEntry.deleteMany()).count;
      }
      if (parts.includes("rimborsi")) counts.rimborsi = (await tx.reimbursement.deleteMany()).count;
      if (parts.includes("prenotazioni")) counts.prenotazioni = (await tx.reservation.deleteMany()).count;
      if (parts.includes("noteBottega")) counts.noteBottega = (await tx.shopNote.deleteMany()).count;
      if (parts.includes("mappa")) counts.puntiMappa = (await tx.spawn.deleteMany()).count;
      if (parts.includes("stalla")) {
        counts.vendite = (await tx.sale.deleteMany()).count;
        counts.passaggi = (await tx.horseTransfer.deleteMany()).count;
        counts.cavalli = (await tx.horse.deleteMany()).count;
      }
    }, { timeout: 60_000 });
    await audit(user, "AZZERAMENTO", "Dati", null, `Azzerati i dati di gioco (${parts.join(", ")}). Backup: ${backup.file}`, counts);
    revalidatePath("/", "layout");
    const tot = Object.values(counts).reduce((a, b) => a + b, 0);
    return { ok: true, message: `Fatto: ${tot} elementi eliminati. Copia di sicurezza: ${backup.file}` };
  });
}
