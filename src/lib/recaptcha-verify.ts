/** Verifica del token reCAPTCHA presso Google (separata per poterla provare nei test). */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
export const KEY_RE = /^[A-Za-z0-9_-]{20,100}$/;

export type VerifyResult = { ok: true; score?: number } | { ok: false; reason: string; unavailable?: boolean };

/** Chiede a Google se il token è valido. In caso di dubbio risponde "no" (sicurezza prima di tutto). */
export async function verifyToken(opts: { token: string; secret: string; version: "v2" | "v3"; minScore: number; ip?: string | null; action?: string }): Promise<VerifyResult> {
  const token = opts.token.trim();
  if (!token || token.length > 4000) return { ok: false, reason: "manca la verifica" };
  const body = new URLSearchParams({ secret: opts.secret, response: token });
  if (opts.ip && opts.ip !== "?") body.set("remoteip", opts.ip);
  let data: { success?: boolean; score?: number; action?: string; "error-codes"?: string[] };
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return { ok: false, reason: `Google ha risposto ${res.status}`, unavailable: true };
    data = await res.json();
  } catch {
    return { ok: false, reason: "Google non raggiungibile", unavailable: true };
  }
  if (!data.success) return { ok: false, reason: (data["error-codes"] ?? ["token non valido"]).join(", ") };
  if (opts.version === "v3") {
    if (opts.action && data.action !== opts.action) return { ok: false, reason: "azione non corrispondente" };
    if (typeof data.score !== "number" || data.score < opts.minScore) return { ok: false, reason: `punteggio basso (${data.score ?? "?"})` };
    return { ok: true, score: data.score };
  }
  return { ok: true };
}
