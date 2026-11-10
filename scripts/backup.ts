/** Crea un backup JSON del database.  npm run backup [-- automatico] */
import { writeBackup, pruneBackups, BACKUP_DIR } from "../src/lib/backup";
import { prisma } from "../src/lib/db";

async function main() {
  const label = process.argv[2] === "automatico" ? "automatico" : "manuale";
  const r = await writeBackup(label);
  if (label === "automatico") await pruneBackups(Number(process.env.BACKUP_KEEP || 14));
  console.log(`[backup] creato ${BACKUP_DIR}/${r.file} (${Math.round(r.size / 1024)} KB)`);
}
main()
  .catch((e) => {
    console.error("[backup] errore:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
