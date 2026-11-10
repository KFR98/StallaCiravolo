/**
 * Backup logico completo del database in JSON (tutte le tabelle tranne le sessioni)
 * e ripristino. Usato dal pannello admin e dallo script `npm run backup`.
 * Le immagini caricate sono file nella cartella UPLOAD_DIR: vanno salvate insieme
 * (i backup del pannello Pterodactyl includono già i file del server).
 */
import path from "node:path";
import { mkdir, writeFile, readdir, stat, unlink } from "node:fs/promises";
import { prisma } from "./db";

export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./data/backups");

const ORDER = [
  "user", "breed", "coat", "statDefinition", "coatStat", "priceHistory", "horse", "sale",
  "spawn", "reservation", "payrollEntry", "payment", "setting", "auditLog",
] as const;
type ModelName = (typeof ORDER)[number];

const TABLES: Record<ModelName, string> = {
  user: "User", breed: "Breed", coat: "Coat", statDefinition: "StatDefinition", coatStat: "CoatStat",
  priceHistory: "PriceHistory", horse: "Horse", sale: "Sale", spawn: "Spawn", reservation: "Reservation",
  payrollEntry: "PayrollEntry", payment: "Payment", setting: "Setting", auditLog: "AuditLog",
};

export type BackupFile = { app: "stalla-ciravolo"; version: 1; createdAt: string; data: Record<string, unknown[]> };

export async function buildBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const m of ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data[m] = await (prisma[m] as any).findMany();
  }
  return { app: "stalla-ciravolo", version: 1, createdAt: new Date().toISOString(), data };
}

export async function writeBackup(label = "manuale"): Promise<{ file: string; size: number }> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const b = await buildBackup();
  const name = `backup-${b.createdAt.replace(/[:.]/g, "-")}-${label}.json`;
  const json = JSON.stringify(b);
  await writeFile(path.join(BACKUP_DIR, name), json);
  return { file: name, size: json.length };
}

export async function listBackups() {
  try {
    const files = (await readdir(BACKUP_DIR)).filter((f) => /^backup-.*\.json$/.test(f));
    const out = await Promise.all(files.map(async (f) => ({ file: f, ...(await stat(path.join(BACKUP_DIR, f))) })));
    return out.map((f) => ({ file: f.file, size: f.size, mtime: f.mtime })).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

/** Mantiene solo gli ultimi `keep` backup automatici. */
export async function pruneBackups(keep: number) {
  const list = (await listBackups()).filter((b) => b.file.endsWith("-automatico.json"));
  for (const b of list.slice(keep)) await unlink(path.join(BACKUP_DIR, b.file)).catch(() => {});
}

export function backupPath(file: string) {
  if (!/^backup-[\w.-]+\.json$/.test(file)) throw new Error("Nome file non valido");
  return path.join(BACKUP_DIR, file);
}

const DATE_KEYS = /(At|Date|weekStart|expiresAt)$/;

function revive(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" && DATE_KEYS.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v;
  }
  return out;
}

/** Ripristino completo: sostituisce TUTTI i dati con quelli del backup (in un'unica transazione). */
export async function restoreBackup(b: BackupFile) {
  if (b?.app !== "stalla-ciravolo" || b.version !== 1 || !b.data) throw new Error("File di backup non valido.");
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
      try {
        await tx.session.deleteMany();
        for (const m of [...ORDER].reverse()) {
          await tx.$executeRawUnsafe(`DELETE FROM \`${TABLES[m]}\``);
        }
        for (const m of ORDER) {
          const rows = (b.data[m] ?? []) as Record<string, unknown>[];
          for (let i = 0; i < rows.length; i += 500) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (tx[m] as any).createMany({ data: rows.slice(i, i + 500).map(revive) });
          }
        }
      } finally {
        await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
      }
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
}
