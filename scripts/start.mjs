/**
 * Avvio in produzione (adatto a Pterodactyl o a qualsiasi server Node):
 *  1. applica le migrazioni del database
 *  2. inizializza impostazioni/catalogo/admin se mancanti (idempotente)
 *  3. avvia il server Next.js sulla porta assegnata (SERVER_PORT o PORT)
 *  4. backup automatico all'avvio e ogni 24 ore
 *  5. comandi da console: backup, help, stop
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.chdir(root);

// Carica .env se presente (le variabili del pannello hanno la precedenza)
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

const port = process.env.SERVER_PORT || process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";
const bin = (n) => path.join(root, "node_modules", ".bin", n);

function run(cmd, args, label) {
  console.log(`[avvio] ${label}…`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`[avvio] ERRORE durante: ${label}`);
    process.exit(r.status ?? 1);
  }
}

// Database SQLite dentro la cartella del server (data/stalla.db), salvo diversa indicazione.
// Un percorso relativo ("file:./data/x.db") viene risolto rispetto alla cartella del progetto.
{
  let url = (process.env.DATABASE_URL || "").trim();
  if (!url) url = "file:./data/stalla.db";
  if (url.startsWith("file:")) {
    const p = url.slice(5);
    const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
    mkdirSync(path.dirname(abs), { recursive: true });
    url = "file:" + abs;
  }
  process.env.DATABASE_URL = url;
  console.log("[avvio] Database: " + url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@"));
}

run(bin("prisma"), ["migrate", "deploy"], "Migrazioni database");
run(bin("tsx"), ["scripts/seed.ts"], "Inizializzazione dati");
if (process.env.IMAGES_AUTO_IMPORT !== "false" && existsSync(path.join(root, "Cavalli"))) {
  // Importa solo le foto nuove della cartella Cavalli/ (non tocca quelle gestite dall'admin)
  spawnSync(bin("tsx"), ["scripts/import-images.ts"], { stdio: "inherit", env: process.env });
}

const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("[avvio] Build mancante: esegui prima `npm run build`.");
  process.exit(1);
}
// Il server standalone ha bisogno dei file statici accanto a sé
mkdirSync(path.join(standalone, ".next"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

const env = {
  ...process.env,
  PORT: port,
  HOSTNAME: host,
  NODE_ENV: "production",
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || "./data/uploads"),
  BACKUP_DIR: path.resolve(process.env.BACKUP_DIR || "./data/backups"),
};
const server = spawn(process.execPath, [path.join(standalone, "server.js")], { stdio: "inherit", env, cwd: standalone });
server.on("exit", (code) => process.exit(code ?? 0));
console.log(`[avvio] Gestionale in ascolto su http://${host}:${port}`);

function backup(label = "automatico") {
  const p = spawn(bin("tsx"), ["scripts/backup.ts", label], { stdio: "inherit", env });
  p.on("error", (e) => console.error("[backup]", e.message));
}
if (process.env.BACKUP_AUTO !== "false") {
  setTimeout(() => backup(), 15_000);
  setInterval(() => backup(), 24 * 3600_000);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const cmd = line.trim().toLowerCase();
  if (cmd === "backup") backup("manuale");
  else if (cmd === "immagini") spawn(bin("tsx"), ["scripts/import-images.ts"], { stdio: "inherit", env });
  else if (cmd === "stop" || cmd === "exit") {
    server.kill("SIGTERM");
  } else if (cmd === "help" || cmd) console.log("Comandi: backup | immagini | stop | help");
});
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.kill(sig));
