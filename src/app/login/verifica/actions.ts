"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { ipFrom } from "@/lib/auth";
import { run, fd, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { open, seal } from "@/lib/secret-box";
import { verifyTotp, newRecoveryCodes, recoveryHash } from "@/lib/totp";
import { getPending, setPending, clearPending, codeAttemptsLeft, codeFailed, codeOk, userForPending } from "@/lib/two-factor";
import { finishLogin } from "@/lib/login";

/**
 * Secondo passo dell'accesso. Chi è l'utente lo dice SOLO il cookie firmato dal server dopo la password giusta.
 * - "verify": codice dell'app oppure un codice di recupero (che poi non vale più).
 * - "enroll": primo codice dall'app appena collegata: si salva il segreto e si mostrano i codici di recupero.
 */
export async function verifyCode(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const p = await getPending();
    if (!p) return { ok: false, error: "Tempo scaduto: rifai l'accesso.", redirect: "/login" };
    const user = await userForPending(p);
    if (!user) { await clearPending(); return { ok: false, error: "Account non disponibile.", redirect: "/login" }; }
    if (codeAttemptsLeft(user.id) <= 0) {
      await clearPending();
      return { ok: false, error: "Troppi codici sbagliati: rifai l'accesso tra qualche minuto.", redirect: "/login" };
    }
    const h = await headers();
    const ip = ipFrom(h) ?? "?";
    const browser = { browser: h.get("user-agent")?.slice(0, 300) ?? null };
    const code = fd(form).str("code").trim().slice(0, 20);

    if (p.mode === "enroll") {
      const secret = p.secret ? open(p.secret) : null;
      if (!secret) { await clearPending(); return { ok: false, error: "Sessione di attivazione non valida: rifai l'accesso.", redirect: "/login" }; }
      const step = verifyTotp(secret, code, null);
      if (step == null) {
        codeFailed(user.id);
        await audit({ id: user.id, username: user.username }, "LOGIN_2FA_FALLITO", "Utente", user.id, `Codice sbagliato durante l'attivazione della doppia verifica`, browser, undefined, ip);
        return { ok: false, error: `Codice non valido. Controlla che l'orario del telefono sia giusto. Tentativi rimasti: ${codeAttemptsLeft(user.id)}.` };
      }
      const codes = newRecoveryCodes();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: seal(secret), totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: JSON.stringify(codes.map(recoveryHash)) },
      });
      await audit({ id: user.id, username: user.username }, "DOPPIA_VERIFICA", "Utente", user.id, `${user.username} ha attivato la doppia verifica`, undefined, undefined, ip);
      codeOk(user.id);
      // si entra solo dopo aver visto i codici di recupero ("Continua"): restano cifrati nel passaggio temporaneo
      await setPending({ uid: user.id, mode: "codes", codes: seal(JSON.stringify(codes)) }, 15);
      return { ok: true, message: "Doppia verifica attiva. Salva i codici di recupero.", redirect: "/login/verifica" };
    }

    if (p.mode !== "verify") return { ok: false, error: "Passaggio non valido: rifai l'accesso.", redirect: "/login" };
    // verify
    const secret = user.totpSecret ? open(user.totpSecret) : null;
    if (!secret) { await clearPending(); return { ok: false, error: "Doppia verifica non configurata correttamente: chiedi all'amministratore di azzerarla.", redirect: "/login" }; }
    const step = /^\d{6}$/.test(code.replace(/\s/g, "")) ? verifyTotp(secret, code, user.totpLastStep) : null;
    let usedRecovery = false;
    if (step == null) {
      // codice di recupero (XXXX-XXXX): vale una volta sola
      const list: string[] = (() => { try { return JSON.parse(user.totpRecovery ?? "[]"); } catch { return []; } })();
      const hsh = recoveryHash(code);
      if (code.replace(/[^A-Za-z0-9]/g, "").length === 8 && list.includes(hsh)) {
        await prisma.user.update({ where: { id: user.id }, data: { totpRecovery: JSON.stringify(list.filter((x) => x !== hsh)) } });
        usedRecovery = true;
      } else {
        codeFailed(user.id);
        await audit({ id: user.id, username: user.username }, "LOGIN_2FA_FALLITO", "Utente", user.id, `Codice di doppia verifica sbagliato per ${user.username}`, browser, undefined, ip);
        if (codeAttemptsLeft(user.id) <= 0) { await clearPending(); return { ok: false, error: "Troppi codici sbagliati: rifai l'accesso tra qualche minuto.", redirect: "/login" }; }
        return { ok: false, error: `Codice non valido. Tentativi rimasti: ${codeAttemptsLeft(user.id)}.` };
      }
    } else {
      // lo stesso codice non vale due volte (anche se qualcuno lo vede mentre lo scrivi)
      const r = await prisma.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
      if (r.count !== 1) return { ok: false, error: "Questo codice è già stato usato: aspetta il prossimo." };
    }
    codeOk(user.id);
    await clearPending();
    await finishLogin(user, ip, browser);
    if (usedRecovery) {
      const left = (JSON.parse((await prisma.user.findUnique({ where: { id: user.id }, select: { totpRecovery: true } }))?.totpRecovery ?? "[]") as string[]).length;
      await audit({ id: user.id, username: user.username }, "LOGIN_RECUPERO", "Utente", user.id, `${user.username} è entrato con un codice di recupero (ne restano ${left})`, browser, undefined, ip);
      return { ok: true, message: `Entrato con un codice di recupero: ne restano ${left}. Se hai perso il telefono, riattiva la doppia verifica dal profilo.`, redirect: "/profilo" };
    }
    return { ok: true, message: `Benvenuto, ${user.displayName}.`, redirect: "/" };
  });
}

/** Dopo aver salvato i codici di recupero: si apre la sessione. */
export async function finishEnroll(): Promise<ActionResult> {
  return run(async () => {
    const p = await getPending();
    if (!p || p.mode !== "codes") return { ok: false, error: "Tempo scaduto: rifai l'accesso.", redirect: "/login" };
    const user = await userForPending(p);
    if (!user || !user.totpEnabledAt) { await clearPending(); return { ok: false, error: "Account non disponibile.", redirect: "/login" }; }
    const h = await headers();
    await clearPending();
    await finishLogin(user, ipFrom(h) ?? "?", { browser: h.get("user-agent")?.slice(0, 300) ?? null });
    return { ok: true, message: `Benvenuto, ${user.displayName}.`, redirect: "/" };
  });
}

export async function cancelTwoFactor() {
  await clearPending();
}
