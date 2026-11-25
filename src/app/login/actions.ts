"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { destroySession, verifyPassword, ipFrom, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { getSecret, loginCaptcha, verifyToken } from "@/lib/recaptcha";
import { roleRequires2fa, setPending, twoFactorOff } from "@/lib/two-factor";
import { seal } from "@/lib/secret-box";
import { finishLogin } from "@/lib/login";
import { newTotpSecret } from "@/lib/totp";
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
    const h = await headers();
    const ip = ipFrom(h) ?? "?";
    // Browser e sistema usati per l'accesso: con l'IP aiutano a confrontare il registro con i log del server
    const browser = { browser: h.get("user-agent")?.slice(0, 300) ?? null };
    const key = ip + "|" + data.username.toLowerCase();
    // Due limiti (configurabili in Impostazioni): errori per IP+utente, ed errori per utente da qualsiasi IP (contro chi cambia IP)
    const ukey = "*|" + data.username.toLowerCase();
    const a = attempts.get(key);
    const ua = attempts.get(ukey);
    const now = Date.now();
    const ls = await getSettings();
    if ((a && a.n >= ls.loginMaxAttempts && a.until > now) || (ua && ua.n >= ls.loginMaxAttemptsUser && ua.until > now)) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);

    // reCAPTCHA (se attivo): si controlla PRIMA della password, così i robot non possono provarle
    const captcha = await loginCaptcha();
    if (captcha) {
      const secret = await getSecret();
      const check = secret
        ? await verifyToken({ token: String(form.get("captcha") ?? ""), secret, version: captcha.version, minScore: ls.recaptchaMinScore, ip, action: "login" })
        : ({ ok: false, reason: "chiave segreta mancante" } as const);
      if (!check.ok) {
        const cur = a && a.until > now ? a : { n: 0, until: 0 };
        attempts.set(key, { n: cur.n + 1, until: now + ls.loginLockMinutes * 60_000 });
        await audit(null, "LOGIN_CAPTCHA_FALLITO", "Utente", null, `Verifica anti-robot non superata per "${data.username}" (${check.reason})`, browser, undefined, ip);
        return { ok: false, error: "unavailable" in check && check.unavailable ? "Verifica anti-robot non disponibile in questo momento. Riprova tra poco." : "Verifica anti-robot non superata. Riprova." };
      }
    }
    const user = await prisma.user.findUnique({ where: { username: data.username } });
    // Verifica sempre una password (anche se l'utente non esiste): i tempi di risposta non rivelano quali nomi esistono
    const pwOk = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, data.password);
    const ok = user && user.active && pwOk;
    if (!ok) {
      const bump = (k: string, x?: { n: number; until: number }, mins = 5) => {
        const cur = x && x.until > now ? x : { n: 0, until: 0 };
        attempts.set(k, { n: cur.n + 1, until: now + mins * 60_000 });
      };
      bump(key, a, ls.loginLockMinutes);
      bump(ukey, ua, ls.loginUserLockMinutes);
      // Molti errori dallo stesso IP in poco tempo: probabile tentativo di indovinare le password (soglie in Impostazioni)
      const recentFails = ip === "?" ? 0 : await prisma.auditLog.count({
        where: { ip, action: { in: ["LOGIN_FALLITO", "LOGIN_FALLITO_RIPETUTO"] }, createdAt: { gte: new Date(now - ls.auditFailBurstMinutes * 60_000) } },
      });
      const burst = recentFails + 1 >= ls.auditFailBurst;
      await audit(
        null, burst ? "LOGIN_FALLITO_RIPETUTO" : "LOGIN_FALLITO", "Utente", user?.id ?? null,
        burst ? `Accesso fallito per "${data.username}" (${recentFails + 1} errori dallo stesso IP in ${ls.auditFailBurstMinutes} min)` : `Accesso fallito per "${data.username}"`,
        browser, undefined, ip,
      );
      return { ok: false, error: user && !user.active && pwOk ? "Account disattivato." : "Credenziali non valide." };
    }
    attempts.delete(key);
    // Doppia verifica: se attiva per l'utente (o obbligatoria per il suo ruolo) la sessione si apre solo dopo il codice
    if (!twoFactorOff() && (user.totpEnabledAt || roleRequires2fa(user.role, ls))) {
      await setPending(user.totpEnabledAt ? { uid: user.id, mode: "verify" } : { uid: user.id, mode: "enroll", secret: seal(newTotpSecret()) }, user.totpEnabledAt ? 5 : 15);
      return { ok: true, message: user.totpEnabledAt ? "Password corretta: ora il codice." : "Password corretta: attiva la doppia verifica.", redirect: "/login/verifica" };
    }
    await finishLogin(user, ip, browser);
    return { ok: true, message: `Benvenuto, ${user.displayName}.`, redirect: "/" };
  });
}

export async function logoutAction() {
  const u = await getCurrentUser();
  await destroySession();
  if (u) await audit(u, "LOGOUT", "Utente", u.id, `Uscita di ${u.username}`);
  redirect("/login");
}

