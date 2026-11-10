"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";

const MAP_SIZE = { width: 2000, height: 1556 };

const schema = z.object({
  x: z.number().min(0).max(MAP_SIZE.width, "Posizione fuori mappa"),
  y: z.number().min(0).max(MAP_SIZE.height, "Posizione fuori mappa"),
  breedId: z.number({ message: "Seleziona la razza" }).int().positive("Seleziona la razza"),
  coatId: z.number().int().positive().nullable(),
  location: z.string().max(120).nullable(),
  description: z.string().max(2000).nullable(),
  notes: z.string().max(2000).nullable(),
});

function read(form: FormData) {
  const f = fd(form);
  return schema.parse({
    x: f.num("x"),
    y: f.num("y"),
    breedId: f.int("breedId") ?? undefined,
    coatId: f.int("coatId"),
    location: f.opt("location"),
    description: f.opt("description"),
    notes: f.opt("notes"),
  });
}

async function checkCoat(breedId: number, coatId: number | null) {
  if (!coatId) return;
  const ok = await prisma.coat.count({ where: { id: coatId, breedId } });
  if (!ok) throw new UserError("Il manto non appartiene alla razza scelta.");
}

export async function createSpawn(form: FormData) {
  return run(async () => {
    const user = await assertPermission("map.add");
    const data = read(form);
    await checkCoat(data.breedId, data.coatId);
    const sp = await prisma.spawn.create({ data: { ...data, createdById: user.id } });
    await audit(user, "NUOVO_SPAWN", "Spawn", sp.id, `Aggiunto spawn #${sp.id}${data.location ? " a " + data.location : ""}`);
    return { ok: true, message: "Spawn aggiunto alla mappa." };
  });
}

async function editable(id: number) {
  const user = await assertPermission("map.view");
  const sp = await prisma.spawn.findUnique({ where: { id } });
  if (!sp) throw new UserError("Spawn non trovato.");
  if (!can(user.role, "map.manage") && sp.createdById !== user.id) throw new UserError("Puoi modificare solo gli spawn inseriti da te.");
  return { user, sp };
}

export async function updateSpawn(form: FormData) {
  return run(async () => {
    const id = fd(form).int("id") ?? 0;
    const { user, sp } = await editable(id);
    const data = read(form);
    await checkCoat(data.breedId, data.coatId);
    await prisma.spawn.update({ where: { id }, data: { ...data, updatedById: user.id } });
    await audit(user, "MODIFICA_SPAWN", "Spawn", id, `Modificato spawn #${id}`, { prima: sp, dopo: data });
    return { ok: true, message: "Spawn aggiornato." };
  });
}

export async function moveSpawn(id: number, x: number, y: number) {
  return run(async () => {
    const { user } = await editable(id);
    const p = schema.pick({ x: true, y: true }).parse({ x, y });
    await prisma.spawn.update({ where: { id }, data: { ...p, updatedById: user.id } });
    await audit(user, "SPOSTA_SPAWN", "Spawn", id, `Spostato spawn #${id}`);
    return { ok: true, message: "Posizione aggiornata." };
  });
}

export async function deleteSpawn(form: FormData) {
  return run(async () => {
    const user = await assertPermission("map.manage");
    const id = fd(form).int("id") ?? 0;
    const sp = await prisma.spawn.findUnique({ where: { id } });
    if (!sp) throw new UserError("Spawn non trovato.");
    await prisma.spawn.delete({ where: { id } });
    await audit(user, "ELIMINA_SPAWN", "Spawn", id, `Eliminato spawn #${id}`, sp);
    return { ok: true, message: "Spawn eliminato." };
  });
}
