"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission, hashPassword, verifyPassword } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";

/** Modifica del proprio account: nome in gioco, nome utente (solo admin) e password. */
export async function updateMyAccount(form: FormData) {
  return run(async () => {
    const me = await assertPermission();
    const f = fd(form);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    const displayName = z.string().trim().min(2, "Nome in gioco troppo corto").max(100).parse(f.str("displayName"));
    const data: { displayName: string; username?: string; passwordHash?: string } = { displayName };
    if (me.role === "ADMIN") {
      const username = z.string().trim().min(3, "Nome utente: almeno 3 caratteri").max(50).regex(/^[a-zA-Z0-9._-]+$/, "Nome utente: solo lettere, numeri, punto, trattino").parse(f.str("username"));
      if (username !== user.username) {
        if (await prisma.user.findUnique({ where: { username } })) throw new UserError("Nome utente già in uso.");
        data.username = username;
      }
    }
    const newPw = f.str("newPassword");
    if (newPw) {
      if (newPw.length < 8) throw new UserError("La nuova password deve avere almeno 8 caratteri.");
      if (!(await verifyPassword(user.passwordHash, f.str("currentPassword")))) throw new UserError("La password attuale non è corretta.");
      data.passwordHash = await hashPassword(newPw);
    }
    await prisma.user.update({ where: { id: me.id }, data });
    await audit(me, "MODIFICA_PROFILO", "Utente", me.id, `Profilo aggiornato${data.username ? ` (nuovo nome utente: ${data.username})` : ""}${data.passwordHash ? " · password cambiata" : ""}`);
    return { ok: true, message: "Profilo aggiornato." };
  });
}
