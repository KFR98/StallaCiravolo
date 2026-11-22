import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { UPLOAD_DIR } from "./uploads";

/**
 * Google reCAPTCHA sulla pagina di accesso.
 * La chiave PUBBLICA (sito) sta nelle impostazioni normali; la chiave SEGRETA sta in una riga a parte
 * del database e non viene MAI mandata al browser (nemmeno al pannello admin: si vede solo se è impostata).
 *
 * Interruttore di emergenza (se le chiavi sono sbagliate e non si riesce più a entrare):
 * crea il file  data/recaptcha-off  dal File Manager di Pterodactyl, oppure imposta RECAPTCHA_OFF=true.
 */

export const SECRET_KEY = "recaptchaSecret";
export { KEY_RE, verifyToken, type VerifyResult } from "./recaptcha-verify";

export function emergencyOff(): boolean {
  if (process.env.RECAPTCHA_OFF?.trim().toLowerCase() === "true") return true;
  try {
    return existsSync(path.join(path.dirname(UPLOAD_DIR), "recaptcha-off"));
  } catch {
    return false;
  }
}

export async function getSecret(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: SECRET_KEY } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/** Configurazione per la pagina di accesso: null se il captcha non va chiesto. */
export async function loginCaptcha(): Promise<{ version: "v2" | "v3"; siteKey: string } | null> {
  const s = await getSettings();
  if (!s.recaptchaEnabled || !s.recaptchaSiteKey || emergencyOff()) return null;
  if (!(await getSecret())) return null;
  return { version: s.recaptchaVersion, siteKey: s.recaptchaSiteKey };
}

