"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, verifyPassword, clientIp, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, type ActionResult } from "@/lib/action";
import { redirect } from "next/navigation";

// Limitazione tentativi (in memoria, per processo)
const attempts = new Map<string, { n: number; until: number }>();
// Hash argon2 di una password casuale, usato solo per uniformare i tempi di risposta
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$+ipsrJghtaLnnFFdjhI0Sg$x+zD9disDxhgMY/DbjWs8uHuRw4nmQ+tZnEoVV1M4tI";

export async function loginAction(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const data = z
      .object({
        username: z.string().min(1, "Inserisci il nome utente").max(50),
        password: z.string().min(1, "Inserisci la password").max(200),
      })
      .parse({ username: form.get("username"), password: form.get("password") });
    const ip = (await clientIp()) ?? "?";
    const key = ip + "|" + data.username.toLowerCase();
    // Due limiti: 5 errori per IP+utente, e 20 errori per utente da qualsiasi IP (contro chi cambia IP)
    const ukey = "*|" + data.username.toLowerCase();
    const a = attempts.get(key);
    const ua = attempts.get(ukey);
    const now = Date.now();
    if ((a && a.n >= 5 && a.until > now) || (ua && ua.n >= 20 && ua.until > now)) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    const user = await prisma.user.findUnique({ where: { username: data.username } });
    // Verifica sempre una password (anche se l'utente non esiste): i tempi di risposta non rivelano quali nomi esistono
    const pwOk = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, data.password);
    const ok = user && user.active && pwOk;
    if (!ok) {
      const bump = (k: string, x?: { n: number; until: number }, mins = 5) => {
        const cur = x && x.until > now ? x : { n: 0, until: 0 };
        attempts.set(k, { n: cur.n + 1, until: now + mins * 60_000 });
      };
      bump(key, a);
      bump(ukey, ua, 15);
      await audit(null, "LOGIN_FALLITO", "Utente", user?.id ?? null, `Accesso fallito per "${data.username}"`, undefined, undefined, ip);
      return { ok: false, error: user && !user.active && pwOk ? "Account disattivato." : "Credenziali non valide." };
    }
    attempts.delete(key);
    await createSession(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ id: user.id, username: user.username }, "LOGIN", "Utente", user.id, `Accesso di ${user.username}`, undefined, undefined, ip);
    return { ok: true, message: `Benvenuto, ${user.displayName}.`, redirect: "/" };
  });
}

export async function logoutAction() {
  const u = await getCurrentUser();
  await destroySession();
  if (u) await audit(u, "LOGOUT", "Utente", u.id, `Uscita di ${u.username}`);
  redirect("/login");
}
