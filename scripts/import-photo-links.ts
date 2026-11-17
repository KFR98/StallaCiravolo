/**
 * Scarica all'avvio le foto elencate in Cavalli/foto-da-link.json e le assegna ai manti.
 * - Le foto finiscono nella cartella upload del server (dati), non nel codice.
 * - Un manto che ha già una foto non viene toccato, salvo "sostituisci": true (una volta sola).
 * - Ogni abbinamento fatto viene ricordato: se l'admin poi cambia la foto, non viene riscritta.
 *   npm run images:links [-- --dry-run]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../src/lib/db";
import { fetchRemoteImage } from "../src/lib/remote-image";

type Entry = { cavallo: string; url: string; sostituisci?: boolean };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const dry = process.argv.includes("--dry-run");
  const file = path.resolve(process.env.IMAGES_SOURCE_DIR || "Cavalli", "foto-da-link.json");
  if (!existsSync(file)) return;
  const entries = (JSON.parse(readFileSync(file, "utf8")).foto ?? []) as Entry[];
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  mkdirSync(path.join(uploadDir, "coats"), { recursive: true });
  const memoFile = path.join(uploadDir, ".foto-link-importate.json");
  const memo = new Set<string>(existsSync(memoFile) ? JSON.parse(readFileSync(memoFile, "utf8")) : []);
  // Già tutte importate: si esce subito, senza database né rete
  if (entries.every((e) => memo.has(`${e.cavallo}|${e.url}`))) return;
  const coats = await prisma.coat.findMany({ include: { breed: true } });
  let done = 0;
  for (const e of entries) {
    const [breed, coatName] = e.cavallo.split("|").map((s) => s.trim().toUpperCase());
    const coat = coats.find((c) => c.breed.name.toUpperCase() === breed && c.name.toUpperCase() === coatName);
    if (!coat) { console.log(`✖ ${e.cavallo}: manto non trovato nel catalogo`); continue; }
    const key = `${e.cavallo}|${e.url}`;
    if (memo.has(key)) continue;
    if (coat.imagePath && !e.sostituisci) { memo.add(key); continue; }
    if (dry) { console.log(`· ${e.cavallo} → da scaricare`); continue; }
    try {
      const buf = await fetchRemoteImage(e.url);
      const rel = `coats/${coat.id}-${slug(coat.breed.name)}-${slug(coat.name)}-link.webp`;
      // verifica che sia davvero un'immagine e la salva in WEBP con la trasparenza
      await sharp(buf).webp({ quality: 88 }).toFile(path.join(uploadDir, rel));
      await prisma.coat.update({ where: { id: coat.id }, data: { imagePath: rel } });
      memo.add(key);
      done++;
      console.log(`✔ ${coat.breed.name} – ${coat.name}`);
    } catch (err) {
      console.log(`✖ ${e.cavallo}: ${(err as Error).message} (riprovo al prossimo avvio)`);
    }
  }
  if (!dry) writeFileSync(memoFile, JSON.stringify([...memo]));
  if (done) console.log(`Foto da link assegnate: ${done}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 0; })
  .finally(() => prisma.$disconnect());
