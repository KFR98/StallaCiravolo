"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, UserError } from "@/lib/action";
import { getSettings } from "@/lib/settings";

/** Salva lo Strillone dell'utente (solo il proprio). Il testo resta esattamente com'è (/, emoji, spazi). */
export async function saveShout(form: FormData) {
  return run(async () => {
    const user = await assertPermission("dashboard.shout");
    const raw = form.get("text");
    const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
    const max = (await getSettings()).shoutMaxLength;
    if (text.length > max) throw new UserError(`Lo strillone può avere al massimo ${max} caratteri (ora ${text.length}).`);
    await prisma.user.update({ where: { id: user.id }, data: { shoutText: text || null } });
    revalidatePath("/");
    return { ok: true, message: text ? "Strillone salvato." : "Strillone cancellato." };
  });
}
