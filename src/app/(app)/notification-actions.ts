"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { activeNoticeKeys } from "@/lib/notifications";

/**
 * Segna come viste (ignora) una o più notifiche, solo per chi lo fa.
 * Si possono ignorare solo notifiche che questa persona vede davvero adesso (controllo sul server).
 * "keys" = chiavi separate da virgola, oppure "tutte".
 */
export async function dismissNotices(form: FormData) {
  return run(async () => {
    const me = await assertPermission("notifications.view");
    const raw = fd(form).str("keys").slice(0, 20_000);
    if (!raw) throw new UserError("Nessuna notifica indicata.");
    const active = await activeNoticeKeys(me);
    const keys = raw === "tutte" ? [...active] : [...new Set(raw.split(",").map((k) => k.trim()))].filter((k) => active.has(k));
    if (!keys.length) return { ok: true, message: "Già a posto." };
    await prisma.$transaction(async (tx) => {
      // pulizia: le notifiche ignorate che non esistono più (cosa sistemata) non servono più
      await tx.noticeDismissal.deleteMany({ where: { userId: me.id, key: { notIn: [...active] } } });
      for (const key of keys) await tx.noticeDismissal.upsert({ where: { userId_key: { userId: me.id, key } }, create: { userId: me.id, key }, update: {} });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: keys.length === 1 ? "Notifica segnata come vista." : `${keys.length} notifiche segnate come viste.` };
  });
}

/** Fa tornare tutte le notifiche ignorate (solo le proprie). */
export async function restoreNotices() {
  return run(async () => {
    const me = await assertPermission("notifications.view");
    const { count } = await prisma.noticeDismissal.deleteMany({ where: { userId: me.id } });
    revalidatePath("/", "layout");
    return { ok: true, message: count ? `Tornano ${count} notifiche.` : "Nessuna notifica da far tornare." };
  });
}
