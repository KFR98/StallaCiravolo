/** Crea un backup JSON del database.  npm run backup [-- automatico] */
import { writeBackup, pruneBackups, BACKUP_DIR } from "../src/lib/backup";
import { prisma } from "../src/lib/db";
import { getSettings } from "../src/lib/settings";

async function main() {
  const label = process.argv[2] === "automatico" ? "automatico" : "manuale";
  const r = await writeBackup(label);
  const days = (await getSettings()).backupDays;
  const removed = await pruneBackups(days);
  console.log(`[backup] creato ${BACKUP_DIR}/${r.file} (${Math.round(r.size / 1024)} KB)${removed ? ` · eliminati ${removed} backup più vecchi di ${days} giorni` : ""}`);
}
main()
  .catch((e) => {
    console.error("[backup] errore:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
