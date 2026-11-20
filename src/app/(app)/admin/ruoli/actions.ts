"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { ADMIN_ROLE, isPermission } from "@/lib/permissions";
import { loadRoles, parseAccess, parsePermissions } from "@/lib/roles";

/** I ruoli li gestisce solo il proprietario (ruolo Amministratore). */
async function assertOwner() {
  const user = await assertPermission();
  if (user.role !== ADMIN_ROLE) throw new UserError("Solo l'amministratore può gestire i ruoli.");
  return user;
}

const slug = (s: string) =>
  s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "RUOLO";

export async function saveRole(form: FormData) {
  return run(async () => {
    const actor = await assertOwner();
    const key = String(form.get("key") ?? "").trim();
    const data = z
      .object({
        name: z.string().trim().min(2, "Dai un nome al ruolo").max(40),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido"),
        mode: z.enum(["all", "only", "except"]),
        rare: z.boolean(),
        legendary: z.boolean(),
      })
      .parse({
        name: form.get("name"), color: form.get("color"), mode: form.get("mode") || "all",
        rare: form.get("rare") === "on", legendary: form.get("legendary") === "on",
      });
    const permissions = form.getAll("perm").map(String).filter(isPermission);
    const breedIds = [...new Set(form.getAll("breed").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (data.mode !== "all" && !breedIds.length) throw new UserError(data.mode === "only" ? "Scegli almeno una razza visibile, oppure seleziona “Tutte le razze”." : "Scegli almeno una razza da nascondere, oppure seleziona “Tutte le razze”.");
    const access = { mode: data.mode, breedIds: data.mode === "all" ? [] : breedIds, rare: data.rare, legendary: data.legendary };

    if (key === ADMIN_ROLE) {
      // del proprietario si cambiano solo nome e colore: ha sempre tutto
      await prisma.appRole.update({ where: { key }, data: { name: data.name, color: data.color } });
    } else if (key) {
      const before = await prisma.appRole.findUnique({ where: { key } });
      if (!before) throw new UserError("Ruolo non trovato.");
      await prisma.appRole.update({ where: { key }, data: { name: data.name, color: data.color, permissions: JSON.stringify(permissions), access: JSON.stringify(access) } });
      await audit(actor, "MODIFICA_RUOLO", "Ruolo", key, `Modificato il ruolo ${data.name}`, {
        prima: { nome: before.name, permessi: parsePermissions(before.permissions), razze: parseAccess(before.access) },
        dopo: { nome: data.name, permessi: permissions, razze: access },
      });
    } else {
      let k = slug(data.name);
      for (let i = 2; await prisma.appRole.findUnique({ where: { key: k } }); i++) k = `${slug(data.name)}_${i}`;
      const max = await prisma.appRole.aggregate({ _max: { sortOrder: true } });
      await prisma.appRole.create({ data: { key: k, name: data.name, color: data.color, sortOrder: (max._max.sortOrder ?? 0) + 10, permissions: JSON.stringify(permissions), access: JSON.stringify(access) } });
      await audit(actor, "CREA_RUOLO", "Ruolo", k, `Creato il ruolo ${data.name}`, { permessi: permissions, razze: access });
      await loadRoles(true);
      revalidatePath("/", "layout");
      return { ok: true, message: `Ruolo “${data.name}” creato.`, data: { key: k } };
    }
    await loadRoles(true);
    revalidatePath("/", "layout");
    return { ok: true, message: "Ruolo salvato." };
  });
}

export async function deleteRole(form: FormData) {
  return run(async () => {
    const actor = await assertOwner();
    const key = String(form.get("key") ?? "");
    const moveTo = String(form.get("moveTo") ?? "");
    if (key === ADMIN_ROLE) throw new UserError("Il ruolo Amministratore non si può eliminare.");
    const role = await prisma.appRole.findUnique({ where: { key } });
    if (!role) throw new UserError("Ruolo non trovato.");
    const members = await prisma.user.count({ where: { role: key } });
    if (members) {
      if (!moveTo || moveTo === key || !(await prisma.appRole.findUnique({ where: { key: moveTo } }))) throw new UserError("Scegli il ruolo a cui spostare gli utenti.");
      if (moveTo === ADMIN_ROLE) throw new UserError("Non si possono spostare in blocco gli utenti nel ruolo Amministratore.");
    }
    await prisma.$transaction(async (tx) => {
      if (members) await tx.user.updateMany({ where: { role: key }, data: { role: moveTo } });
      await tx.appRole.delete({ where: { key } });
      await audit(actor, "ELIMINA_RUOLO", "Ruolo", key, `Eliminato il ruolo ${role.name}${members ? ` (${members} utenti spostati in ${moveTo})` : ""}`, undefined, tx);
    });
    await loadRoles(true);
    revalidatePath("/", "layout");
    return { ok: true, message: `Ruolo “${role.name}” eliminato.` };
  });
}

/** Ordine dei ruoli nell'elenco (su/giù). */
export async function moveRole(key: string, dir: -1 | 1) {
  return run(async () => {
    await assertOwner();
    const roles = await prisma.appRole.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const i = roles.findIndex((r) => r.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= roles.length) return { ok: true };
    [roles[i], roles[j]] = [roles[j], roles[i]];
    await prisma.$transaction(roles.map((r, idx) => prisma.appRole.update({ where: { key: r.key }, data: { sortOrder: idx * 10 } })));
    await loadRoles(true);
    revalidatePath("/admin/ruoli");
    return { ok: true };
  });
}
