import { ZodError } from "zod";
import { AuthError } from "./auth";
import { Prisma } from "@prisma/client";

export type ActionResult = { ok: boolean; message?: string; error?: string; redirect?: string; data?: unknown };

export class UserError extends Error {}

/** Esegue un'azione server restituendo sempre un risultato serializzabile con messaggio in italiano. */
export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof AuthError || e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const first = e.issues[0];
      return { ok: false, error: first?.message || "Dati non validi." };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, error: "Esiste già un elemento con questi dati (valore duplicato)." };
      if (e.code === "P2003") return { ok: false, error: "Impossibile: l'elemento è collegato ad altri dati." };
      if (e.code === "P2025") return { ok: false, error: "Elemento non trovato o già modificato da un altro utente." };
    }
    // Errore inatteso: non esporre dettagli al client
    console.error("[azione]", e);
    return { ok: false, error: "Errore imprevisto. Riprova o contatta l'amministratore." };
  }
}

/** Helper per leggere FormData */
export function fd(form: FormData) {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    str,
    opt: (k: string) => str(k) || null,
    num: (k: string) => {
      const s = str(k).replace(",", ".");
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    },
    int: (k: string) => {
      const s = str(k);
      if (s === "") return null;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : NaN;
    },
    bool: (k: string) => form.get(k) === "on" || form.get(k) === "true" || form.get(k) === "1",
  };
}
