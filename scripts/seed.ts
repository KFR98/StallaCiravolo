/**
 * Inizializzazione database: impostazioni, catalogo dal listino e account admin.
 * Idempotente: può essere rieseguito senza duplicare o cancellare dati.
 *   npm run db:seed
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/lib/db";
import { applyListino } from "../src/lib/catalog-import";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import type { ParsedListino } from "../src/lib/excel-import";

async function main() {
  // SQLite: modalità WAL = letture e scritture contemporanee senza blocchi (persistente nel file)
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");

  // Impostazioni di default (solo quelle mancanti)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: {} });
  }

  // Catalogo
  const file = path.join(__dirname, "..", "prisma", "seed-data", "listino.json");
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ParsedListino;
    const r = await applyListino(parsed, "solo_nuovi", null);
    console.log(`Catalogo: ${r.breedsCreated} razze e ${r.coatsCreated} manti creati, ${r.coatsSkipped} già presenti.`);
  }

  // Bottega (foglio PREZZI): solo se ancora vuota
  const shopFile = path.join(__dirname, "..", "prisma", "seed-data", "bottega.json");
  if (existsSync(shopFile) && (await prisma.shopItem.count()) === 0 && (await prisma.supplier.count()) === 0) {
    const shop = JSON.parse(readFileSync(shopFile, "utf8")) as {
      items: { kind: "VENDITA" | "MATERIA_PRIMA"; name: string; group: string | null; price: number | null; priceNote: string | null; sortOrder: number }[];
      suppliers: { name: string; activity: string | null; goods: string | null; missiva: string | null; starred: boolean; notes: string | null }[];
    };
    await prisma.shopItem.createMany({ data: shop.items });
    await prisma.supplier.createMany({ data: shop.suppliers });
    console.log(`Bottega: ${shop.items.length} articoli e ${shop.suppliers.length} fornitori importati.`);
  }

  // Admin iniziale
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString("base64url");
    await prisma.user.create({
      data: {
        username,
        displayName: "Amministratore",
        role: "ADMIN",
        passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      },
    });
    console.log("──────────────────────────────────────────────");
    console.log(` Account admin creato: ${username}`);
    console.log(` Password: ${password}`);
    console.log(" Cambiala al primo accesso (Admin → Utenti).");
    console.log("──────────────────────────────────────────────");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
