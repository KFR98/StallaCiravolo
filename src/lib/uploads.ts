import "server-only";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");

const TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Risolve un percorso relativo dentro la cartella upload, bloccando path traversal. */
export function safeUploadPath(rel: string) {
  const full = path.resolve(UPLOAD_DIR, rel);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Percorso non valido");
  return full;
}

/** Controlla la firma del file (non solo l'estensione dichiarata). */
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  return null;
}

export async function saveImage(file: File, folder: string, prefix: string): Promise<string> {
  if (!file || file.size === 0) throw new Error("Nessun file selezionato.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Immagine troppo grande (massimo 8 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) throw new Error("Formato non supportato: usa JPG, PNG, WEBP o GIF.");
  const name = `${prefix}-${randomBytes(4).toString("hex")}${TYPES[type]}`;
  const rel = `${folder}/${name}`;
  await mkdir(path.join(UPLOAD_DIR, folder), { recursive: true });
  await writeFile(safeUploadPath(rel), buf);
  return rel;
}

export async function deleteUpload(rel: string | null | undefined) {
  if (!rel) return;
  try {
    await unlink(safeUploadPath(rel));
  } catch {
    /* già rimosso */
  }
}
