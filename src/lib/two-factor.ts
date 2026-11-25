import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import { UPLOAD_DIR } from "./uploads";
import { sign, verifySigned } from "./secret-box";
import type { Settings } from "./settings";

/**
 * Doppia verifica: dopo la password serve il codice a 6 cifre dell'app sul telefono.
 * - Obbligatoria per i ruoli scelti in Impostazioni (chi non l'ha ancora attivata la attiva al primo accesso).
 * - Facoltativa per tutti gli altri, dal proprio profilo.
 * Interruttore di emergenza: file data/2fa-off (dal File Manager di Pterodactyl) oppure TWOFA_OFF=true.
 */

export function twoFactorOff(): boolean {
  if (process.env.TWOFA_OFF?.trim().toLowerCase() === "true") return true;
  try {
    return existsSync(path.join(path.dirname(UPLOAD_DIR), "2fa-off"));
  } catch {
    return false;
  }
}

export const roleRequires2fa = (role: string, s: Settings) => s.twoFactorRoles.includes(role);

/** Passaggio temporaneo "password giusta, manca il codice": cookie firmato, valido pochi minuti. */
const COOKIE = "stalla_2fa";
/** codes: dopo l'attivazione, i codici di recupero (cifrati) da mostrare prima di entrare */
export type Pending = { uid: number; mode: "verify" | "enroll" | "codes"; exp: number; secret?: string; codes?: string };

export async function setPending(p: Omit<Pending, "exp">, minutes = 5) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const secure = process.env.COOKIE_SECURE === "false" ? false : proto ? proto === "https" : (h.get("origin") ?? "").startsWith("https://");
  (await cookies()).set(COOKIE, sign({ ...p, exp: Date.now() + minutes * 60_000 }), {
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: minutes * 60,
  });
}

export async function getPending(): Promise<Pending | null> {
  const p = verifySigned<Pending>((await cookies()).get(COOKIE)?.value);
  if (!p || typeof p.uid !== "number" || p.exp < Date.now()) return null;
  return p;
}

export async function clearPending() {
  (await cookies()).delete(COOKIE);
}

// Tentativi sbagliati di codice: dopo 5 in 10 minuti bisogna rifare l'accesso (in memoria, per processo)
const fails = new Map<number, { n: number; until: number }>();
export function codeAttemptsLeft(uid: number) {
  const f = fails.get(uid);
  if (!f || f.until < Date.now()) return 5;
  return Math.max(0, 5 - f.n);
}
export function codeFailed(uid: number) {
  const f = fails.get(uid);
  const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 10 * 60_000 };
  fails.set(uid, { n: cur.n + 1, until: cur.until });
}
export const codeOk = (uid: number) => fails.delete(uid);

export async function userForPending(p: Pending) {
  const u = await prisma.user.findUnique({ where: { id: p.uid } });
  return u && u.active && !u.deletedAt ? u : null;
}
