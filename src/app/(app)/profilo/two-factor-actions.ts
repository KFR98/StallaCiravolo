"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { open, seal } from "@/lib/secret-box";
import { newTotpSecret, otpauthUrl, verifyTotp, newRecoveryCodes, recoveryHash } from "@/lib/totp";
import { roleRequires2fa, twoFactorOff } from "@/lib/two-factor";

/** Primo passo dal profilo: nuovo segreto + QR (il segreto torna indietro firmato/cifrato, non in chiaro nel modulo). */
export async function startTotp() {
  return run(async () => {
    const me = await assertPermission();
    const s = await getSettings();
    const secret = newTotpSecret();
    const qr = await QRCode.toString(otpauthUrl(secret, me.username, s.stableName), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    return { ok: true, data: { qr, secret, sealed: seal(JSON.stringify({ uid: me.id, secret, exp: Date.now() + 15 * 60_000 })) } };
  });
}

async function myCodeOk(me: { id: number }, code: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const secret = u.totpSecret ? open(u.totpSecret) : null;
  if (!secret || !u.totpEnabledAt) throw new UserError("La doppia verifica non è attiva.");
  const c = code.trim();
  const step = verifyTotp(secret, c, u.totpLastStep);
  if (step != null) {
    await prisma.user.update({ where: { id: u.id }, data: { totpLastStep: step } });
    return u;
  }
  throw new UserError("Codice non valido: usa quello attuale dell'app.");
}

/** Conferma con il primo codice: la doppia verifica diventa attiva e si mostrano i codici di recupero. */
export async function confirmTotp(form: FormData) {
  return run(async () => {
    const me = await assertPermission();
    const f = fd(form);
    let payload: { uid: number; secret: string; exp: number } | null = null;
    try { payload = JSON.parse(open(f.str("sealed")) ?? "null"); } catch { payload = null; }
    if (!payload || payload.uid !== me.id || payload.exp < Date.now()) throw new UserError("Attivazione scaduta: ricomincia.");
    const step = verifyTotp(payload.secret, f.str("code"), null);
    if (step == null) throw new UserError("Codice non valido. Controlla che l'orario del telefono sia giusto.");
    const codes = newRecoveryCodes();
    await prisma.user.update({
      where: { id: me.id },
      data: { totpSecret: seal(payload.secret), totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: JSON.stringify(codes.map(recoveryHash)) },
    });
    await audit(me, "DOPPIA_VERIFICA", "Utente", me.id, `${me.username} ha attivato la doppia verifica`, undefined, undefined, await clientIp());
    return { ok: true, message: "Doppia verifica attiva.", data: { recovery: codes } };
  });
}

export async function newRecovery(form: FormData) {
  return run(async () => {
    const me = await assertPermission();
    await myCodeOk(me, fd(form).str("code"));
    const codes = newRecoveryCodes();
    await prisma.user.update({ where: { id: me.id }, data: { totpRecovery: JSON.stringify(codes.map(recoveryHash)) } });
    await audit(me, "DOPPIA_VERIFICA", "Utente", me.id, `${me.username} ha generato nuovi codici di recupero (i vecchi non valgono più)`);
    return { ok: true, message: "Nuovi codici di recupero creati.", data: { recovery: codes } };
  });
}

export async function disableTotp(form: FormData) {
  return run(async () => {
    const me = await assertPermission();
    if (roleRequires2fa(me.role, await getSettings()) && !twoFactorOff()) throw new UserError("Per il tuo ruolo la doppia verifica è obbligatoria: non si può spegnere.");
    await myCodeOk(me, fd(form).str("code"));
    await prisma.user.update({ where: { id: me.id }, data: { totpSecret: null, totpEnabledAt: null, totpRecovery: null, totpLastStep: null } });
    await audit(me, "DOPPIA_VERIFICA_TOLTA", "Utente", me.id, `${me.username} ha disattivato la doppia verifica`, undefined, undefined, await clientIp());
    return { ok: true, message: "Doppia verifica disattivata." };
  });
}
