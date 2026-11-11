"use server";

import { assertPermission } from "@/lib/auth";
import { run, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { writeBackup, restoreBackup, pruneBackups, type BackupFile } from "@/lib/backup";
import { getSettings } from "@/lib/settings";

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
