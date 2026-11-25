import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "./uploads";

/**
 * Chiave segreta del server (32 byte casuali) salvata in data/.chiave-segreta, creata al primo uso.
 * Serve a cifrare i segreti della doppia verifica nel database e a firmare il passaggio "password ok → codice".
 * Così un backup del database da solo non basta a generare i codici di nessuno.
 */
const KEY_FILE = path.join(path.dirname(UPLOAD_DIR), ".chiave-segreta");
let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;
  if (existsSync(KEY_FILE)) {
    const k = Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64");
    if (k.length === 32) return (cached = k);
  }
  const k = randomBytes(32);
  writeFileSync(KEY_FILE, k.toString("base64"), { mode: 0o600 });
  try { chmodSync(KEY_FILE, 0o600); } catch { /* su alcuni sistemi non serve */ }
  return (cached = k);
}

/** Cifra un testo (AES-256-GCM). */
export function seal(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Firma breve (per il passaggio temporaneo tra password e codice). */
export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySigned<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
