/**
 * Backup automatico eseguito dentro il server del gestionale.
 * Ogni 5 minuti controlla le impostazioni: se il backup automatico è attivo e
 * l'ultimo è più vecchio dell'intervallo scelto, ne crea uno nuovo ed elimina
 * quelli oltre il periodo di conservazione. Le modifiche alle impostazioni
 * valgono subito, senza riavviare.
 */
import { getSettings } from "./settings";
import { listBackups, writeBackup, pruneBackups } from "./backup";

const g = globalThis as unknown as { __backupScheduler?: boolean };

export async function backupTick() {
  if (process.env.BACKUP_AUTO === "false") return;
  const s = await getSettings();
  if (!s.backupAuto) return;
  const last = (await listBackups()).find((b) => b.file.endsWith("-automatico.json"));
  const every = Math.max(1, s.backupEveryHours) * 3600_000;
  if (last && Date.now() - last.mtime.getTime() < every - 60_000) return;
  const r = await writeBackup("automatico");
  const removed = await pruneBackups(s.backupDays);
  console.log(`[backup] automatico creato: ${r.file}${removed ? ` · eliminati ${removed} backup oltre ${s.backupDays} giorni` : ""}`);
}

export function startBackupScheduler() {
  if (g.__backupScheduler) return;
  g.__backupScheduler = true;
  const tick = () => backupTick().catch((e) => console.error("[backup] errore backup automatico:", e));
  setTimeout(tick, 20_000);
  setInterval(tick, 5 * 60_000);
}
