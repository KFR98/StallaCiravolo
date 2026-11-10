"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, verifyPassword, clientIp, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, type ActionResult } from "@/lib/action";
import { redirect } from "next/navigation";

// Limitazione tentativi (in memoria, per processo)
const attempts = new Map<string, { n: number; until: number }>();

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
    const a = attempts.get(key);
    if (a && a.n >= 5 && a.until > Date.now()) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    const user = await prisma.user.findUnique({ where: { username: data.username } });
    const ok = user && user.active && (await verifyPassword(user.passwordHash, data.password));
    if (!ok) {
      const cur = a && a.until > Date.now() ? a : { n: 0, until: 0 };
      attempts.set(key, { n: cur.n + 1, until: Date.now() + 5 * 60_000 });
      await audit(null, "LOGIN_FALLITO", "Utente", user?.id ?? null, `Accesso fallito per "${data.username}"`, undefined, undefined, ip);
      return { ok: false, error: user && !user.active ? "Account disattivato." : "Credenziali non valide." };
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
