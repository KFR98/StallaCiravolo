/**
 * Abbina le foto della cartella Cavalli/ ai manti del catalogo e le copia nella
 * cartella upload. Non sovrascrive immagini già impostate (usa --force per farlo).
 * Ogni abbinamento viene ricordato: se l'admin rimuove o cambia un'immagine,
 * all'avvio successivo non viene reimportata.
 *   npm run images:import [-- --force] [-- --dir=Cavalli]
 * Abbinamenti manuali: file Cavalli/abbinamenti.json  { "nome file.webp": "RAZZA|Manto" }
 */
import { readdirSync, existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { bestImageFor } from "../src/lib/image-match";

const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const force = process.argv.includes("--force");
  const dirArg = process.argv.find((a) => a.startsWith("--dir="));
  const srcDir = path.resolve(dirArg ? dirArg.slice(6) : process.env.IMAGES_SOURCE_DIR || "Cavalli");
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  if (!existsSync(srcDir)) throw new Error("Cartella immagini non trovata: " + srcDir);
  const files = readdirSync(srcDir).filter((f) => IMG_RE.test(f));
  const manualFile = path.join(srcDir, "abbinamenti.json");
  const manual: Record<string, string> = existsSync(manualFile) ? JSON.parse(readFileSync(manualFile, "utf8")) : {};

  const coats = await prisma.coat.findMany({ include: { breed: true } });
  mkdirSync(path.join(uploadDir, "coats"), { recursive: true });
  const memoFile = path.join(uploadDir, ".immagini-importate.json");
  const memo = new Set<string>(existsSync(memoFile) ? JSON.parse(readFileSync(memoFile, "utf8")) : []);
  const used = new Set<string>();
  let assigned = 0;
  const missing: string[] = [];

  for (const coat of coats) {
    const key = `${coat.breed.name}|${coat.name}`.toUpperCase();
    const manualEntry = Object.entries(manual).find(([, v]) => v.toUpperCase() === key);
    const file = manualEntry?.[0] ?? bestImageFor(coat.breed.name, coat.name, files);
    if (!file || !files.includes(file)) {
      if (!coat.imagePath) missing.push(`${coat.breed.name} – ${coat.name}`);
      continue;
    }
    used.add(file);
    const memoKey = `${coat.id}|${file}`;
    if (!force && (coat.imagePath || memo.has(memoKey))) continue;
    const ext = path.extname(file).toLowerCase();
    const rel = `coats/${coat.id}-${slug(coat.breed.name)}-${slug(coat.name)}${ext}`;
    copyFileSync(path.join(srcDir, file), path.join(uploadDir, rel));
    await prisma.coat.update({ where: { id: coat.id }, data: { imagePath: rel } });
    memo.add(memoKey);
    assigned++;
    console.log(`✔ ${coat.breed.name} – ${coat.name}  ←  ${file}`);
  }

  writeFileSync(memoFile, JSON.stringify([...memo]));
  console.log(`\nImmagini assegnate: ${assigned}`);
  const unused = files.filter((f) => !used.has(f));
  if (unused.length) {
    console.log(`\nFile non abbinati (${unused.length}) – aggiungili in abbinamenti.json se servono:`);
    for (const f of unused) console.log("  · " + f);
  }
  console.log(`\nManti senza immagine (${missing.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
