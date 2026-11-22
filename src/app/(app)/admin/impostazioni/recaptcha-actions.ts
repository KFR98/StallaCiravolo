"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { KEY_RE, SECRET_KEY, getSecret, verifyToken } from "@/lib/recaptcha";

const put = (key: string, value: unknown) =>
  prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });

/**
 * Salva le chiavi reCAPTCHA. Per ATTIVARLO (o cambiare chiavi/tipo mentre è attivo) bisogna superare
 * una prova con le chiavi nuove: così non ci si chiude fuori con chiavi sbagliate.
 */
export async function saveRecaptcha(form: FormData) {
  return run(async () => {
    const user = await assertPermission("settings.manage");
    const f = fd(form);
    const data = z.object({
      enabled: z.boolean(),
      version: z.enum(["v2", "v3"], { message: "Scegli il tipo di reCAPTCHA" }),
      siteKey: z.string().trim().refine((v) => v === "" || KEY_RE.test(v), "La chiave pubblica non sembra valida (copiala di nuovo dalla console di Google)."),
      secret: z.string().trim().refine((v) => v === "" || KEY_RE.test(v), "La chiave segreta non sembra valida (copiala di nuovo dalla console di Google)."),
      minScore: z.number({ message: "Indica il punteggio minimo" }).min(0, "Minimo 0").max(1, "Massimo 1"),
    }).parse({ enabled: f.bool("enabled"), version: f.str("version"), siteKey: f.str("siteKey"), secret: f.str("secret"), minScore: f.num("minScore") ?? 0.5 });

    const prev = await getSettings();
    const oldSecret = await getSecret();
    const secret = data.secret || oldSecret;
    const keysChanged = data.siteKey !== prev.recaptchaSiteKey || !!data.secret || data.version !== prev.recaptchaVersion;

    if (data.enabled) {
      if (!data.siteKey || !secret) throw new UserError("Per attivarlo servono sia la chiave pubblica sia quella segreta.");
      if (!prev.recaptchaEnabled || keysChanged) {
        const check = await verifyToken({ token: f.str("captcha"), secret, version: data.version, minScore: data.minScore, ip: await clientIp(), action: "admin_test" });
        if (!check.ok) {
          throw new UserError(
            check.reason === "manca la verifica"
              ? "Prima di attivarlo fai la prova qui sotto (serve a controllare che le chiavi funzionino)."
              : `La prova non è riuscita (${check.reason}). Controlla le chiavi, il tipo (v2/v3) e che il dominio sia tra quelli autorizzati nella console di Google.`,
          );
        }
      }
    }

    await prisma.$transaction([
      put("recaptchaEnabled", data.enabled),
      put("recaptchaVersion", data.version),
      put("recaptchaSiteKey", data.siteKey),
      put("recaptchaMinScore", data.minScore),
      ...(data.secret ? [put(SECRET_KEY, data.secret)] : []),
    ]);
    // la chiave segreta non finisce mai nel registro: solo se è stata cambiata
    await audit(user, "RECAPTCHA", "Impostazioni", null, data.enabled ? "reCAPTCHA sulla pagina di accesso: ATTIVO" : "reCAPTCHA sulla pagina di accesso: spento", {
      prima: { attivo: prev.recaptchaEnabled, tipo: prev.recaptchaVersion, chiavePubblica: prev.recaptchaSiteKey || null, punteggioMinimo: prev.recaptchaMinScore },
      dopo: { attivo: data.enabled, tipo: data.version, chiavePubblica: data.siteKey || null, punteggioMinimo: data.minScore, chiaveSegreta: data.secret ? "cambiata" : "invariata" },
    });
    revalidatePath("/admin/impostazioni");
    revalidatePath("/login");
    return { ok: true, message: data.enabled ? "reCAPTCHA attivo sulla pagina di accesso." : "Impostazioni reCAPTCHA salvate." };
  });
}
