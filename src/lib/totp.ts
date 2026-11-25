import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

/**
 * Codici a 6 cifre (TOTP, RFC 6238) compatibili con Google Authenticator, Authy, Microsoft Authenticator…
 * Nessuna libreria esterna: solo le funzioni crittografiche di Node.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Nuovo segreto (160 bit, come consigliato). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

const STEP = 30;
export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP);

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

/**
 * Verifica un codice accettando ±1 intervallo (orologio del telefono un po' avanti o indietro).
 * Restituisce l'intervallo usato (da salvare: lo stesso codice non deve valere due volte) oppure null.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const ok = timingSafeEqual(Buffer.from(totpAt(secret, s)), Buffer.from(c));
    if (ok) return s;
  }
  return null;
}

/** Indirizzo da mettere nel QR code (otpauth://). */
export function otpauthUrl(secret: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Codici di recupero: 10 codici "XXXX-XXXX" (si mostrano una volta sola; si salvano solo le impronte). */
export function newRecoveryCodes(n = 10) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const recoveryHash = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
