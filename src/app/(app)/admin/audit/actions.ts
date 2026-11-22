"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { AUDIT_ACTIONS, LEVELS, isLevel } from "@/lib/audit-levels";

const save = (key: string, value: unknown) =>
  prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });

/** Livelli di pericolosità: nome e colore di ogni livello, livello di ogni azione, soglie degli allarmi automatici. */
export async function saveAuditLevels(form: FormData) {
  return run(async () => {
    const user = await assertPermission("settings.manage");
    const f = fd(form);
    const prev = await getSettings();

    const style = Object.fromEntries(
      LEVELS.map((l) => [
        l,
        z.object({
          name: z.string().trim().min(1, "Ogni livello deve avere un nome").max(16, "Nome del livello: massimo 16 caratteri"),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido"),
        }).parse({ name: f.str(`name_${l}`), color: f.str(`color_${l}`) }),
      ]),
    ) as typeof prev.auditLevelStyle;

    // Si salvano solo le azioni conosciute, e solo se diverse dalla proposta
    const overrides: Record<string, string> = {};
    for (const [action, def] of Object.entries(AUDIT_ACTIONS)) {
      const v = f.str(`lv_${action}`);
      if (isLevel(v) && v !== def.level) overrides[action] = v;
    }

    const burst = z.object({
      auditFailBurst: z.number({ message: "Indica dopo quanti errori scatta l'allarme" }).int().min(2).max(1000),
      auditFailBurstMinutes: z.number({ message: "Indica in quanti minuti" }).int().min(1).max(1440),
      auditNewIpLogin: z.boolean(),
    }).parse({ auditFailBurst: f.int("auditFailBurst"), auditFailBurstMinutes: f.int("auditFailBurstMinutes"), auditNewIpLogin: f.bool("auditNewIpLogin") });

    await prisma.$transaction([
      save("auditLevelStyle", style),
      save("auditLevelOverrides", overrides),
      ...Object.entries(burst).map(([k, v]) => save(k, v)),
    ]);
    await audit(user, "IMPOSTAZIONI", "Impostazioni", null, "Cambiati i livelli di pericolosità del registro attività", {
      prima: { livelli: prev.auditLevelStyle, azioni: prev.auditLevelOverrides },
      dopo: { livelli: style, azioni: overrides, ...burst },
    });
    revalidatePath("/admin/audit");
    return { ok: true, message: "Livelli salvati." };
  });
}
