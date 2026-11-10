/**
 * Legge il file Excel e salva il listino in prisma/seed-data/listino.json
 * (usato dal seed). Stampa il riepilogo e le anomalie PRIMA dell'importazione.
 *   npx tsx scripts/extract-listino.ts percorso/file.xlsx
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseListino } from "../src/lib/excel-import";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Uso: npx tsx scripts/extract-listino.ts <file.xlsx>");
  const parsed = await parseListino(readFileSync(file));
  const out = path.join(__dirname, "..", "prisma", "seed-data", "listino.json");
  writeFileSync(out, JSON.stringify(parsed, null, 2));
  console.log(`Fogli: ${parsed.sheetNames.join(", ")}`);
  console.log(`Fogli non usati per il catalogo: ${parsed.ignoredSheets.join(", ")}`);
  console.log(`Statistiche: ${parsed.statColumns.map((s) => s.label).join(", ")}`);
  console.log(`Razze: ${parsed.breeds.length} – Manti: ${parsed.rows.length}`);
  for (const b of parsed.breeds) console.log(`  ${b.isCustom ? "[MOD] " : "      "}${b.name}: ${b.coats}`);
  console.log(`\nAnomalie (${parsed.anomalies.length}):`);
  for (const a of parsed.anomalies) console.log(`  [${a.level}] ${a.row ? "riga " + a.row + ": " : ""}${a.message}`);
  console.log(`\nSalvato in ${out}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
