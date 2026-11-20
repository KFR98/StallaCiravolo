"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeBackup } from "@/lib/backup";
import { assertPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { NOTE_COLORS } from "./colors";

const MAP_SIZE = { width: 2000, height: 1556 };


const schema = z
  .object({
    kind: z.enum(["CAVALLO", "POSSIBILE", "NOTA", "RARO", "LEGGENDARIO"]),
    title: z.string().trim().max(80).nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido").nullable(),
    x: z.number().min(0).max(MAP_SIZE.width, "Posizione fuori mappa"),
    y: z.number().min(0).max(MAP_SIZE.height, "Posizione fuori mappa"),
    breedId: z.number().int().positive().nullable(),
    coatId: z.number().int().positive().nullable(),
    location: z.string().max(120).nullable(),
    description: z.string().max(2000).nullable(),
    notes: z.string().max(2000).nullable(),
  })
  .refine((d) => d.kind !== "CAVALLO" || d.breedId, { message: "Per uno spawn di cavallo scegli razza e manto" })
  .refine((d) => d.kind !== "NOTA" || d.title, { message: "Dai un titolo alla nota" })
  .refine((d) => (d.kind !== "RARO" && d.kind !== "LEGGENDARIO") || d.breedId || d.title, { message: "Scegli la razza o scrivi il nome del cavallo" })
  .transform((d) => ({
    ...d,
    // le note non hanno cavallo; i cavalli non hanno colore personalizzato.
    // Rari e leggendari: razza dal catalogo (facoltativa) + nome libero nel titolo
    breedId: d.kind === "NOTA" ? null : d.breedId,
    coatId: d.kind === "NOTA" ? null : d.coatId,
    color: d.kind === "NOTA" ? d.color ?? NOTE_COLORS[0] : null,
    title: d.kind === "NOTA" || d.kind === "RARO" || d.kind === "LEGGENDARIO" ? d.title : null,
  }));

function read(form: FormData) {
  const f = fd(form);
  return schema.parse({
    kind: f.str("kind") || "CAVALLO",
    title: f.opt("title"),
    color: f.opt("color"),
    x: f.num("x"),
    y: f.num("y"),
    breedId: f.int("breedId"),
    coatId: f.int("coatId"),
    location: f.opt("location"),
    description: f.opt("description"),
    notes: f.opt("notes"),
  });
}

async function checkCoat(breedId: number | null, coatId: number | null) {
  if (!coatId || !breedId) return;
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
    return { ok: true, message: data.kind === "NOTA" ? "Nota aggiunta alla mappa." : data.kind === "POSSIBILE" ? "Possibile cavallo segnato sulla mappa." : "Spawn aggiunto alla mappa." };
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
    // Spostare i segnaposto è riservato a admin, direttore e gestore (modalità "Modifica")
    const user = await assertPermission("map.manage");
    if (!(await prisma.spawn.findUnique({ where: { id } }))) throw new UserError("Spawn non trovato.");
    const p = z.object({ x: z.number().min(0).max(MAP_SIZE.width), y: z.number().min(0).max(MAP_SIZE.height) }).parse({ x, y });
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

/** Nomi delle categorie delle note (un nome per colore): li vedono tutti nei filtri della mappa. */
export async function saveNoteNames(form: FormData) {
  return run(async () => {
    const user = await assertPermission("map.manage");
    const f = fd(form);
    const names: Record<string, string> = {};
    for (const c of NOTE_COLORS) {
      const v = z.string().trim().max(24, "Nome categoria: massimo 24 caratteri").parse(f.str("n" + c.slice(1)));
      if (v) names[c] = v;
    }
    await prisma.setting.upsert({ where: { key: "mapNoteNames" }, create: { key: "mapNoteNames", value: JSON.stringify(names) }, update: { value: JSON.stringify(names) } });
    await audit(user, "CATEGORIE_NOTE", "Impostazioni", null, "Aggiornati i nomi delle categorie delle note sulla mappa", names);
    return { ok: true, message: "Categorie aggiornate." };
  });
}

/* ───────── Backup dei punti: reimportazione da file JSON ───────── */

const importPoint = z.object({
  tipo: z.enum(["CAVALLO", "POSSIBILE", "NOTA", "RARO", "LEGGENDARIO"]),
  titolo: z.string().max(80).nullable().optional(),
  colore: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  x: z.number().min(0).max(MAP_SIZE.width),
  y: z.number().min(0).max(MAP_SIZE.height),
  razza: z.string().max(120).nullable().optional(),
  manto: z.string().max(120).nullable().optional(),
  posizione: z.string().max(120).nullable().optional(),
  descrizione: z.string().max(2000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  autore: z.string().max(50).nullable().optional(),
});
const importFile = z.object({
  formato: z.literal("stalla-ciravolo-mappa"),
  versione: z.number().int().min(1).max(1),
  categorieNote: z.record(z.string(), z.string().max(24)).optional(),
  punti: z.array(z.unknown()).max(5000),
});

/**
 * Reimporta un file esportato dalla mappa.
 * - "aggiungi": mette i punti del file accanto a quelli esistenti, saltando quelli già presenti.
 * - "sostituisci": elimina tutti i punti attuali e mette quelli del file (prima viene creato un backup).
 */
export async function importSpawns(form: FormData) {
  return run(async () => {
    const user = await assertPermission("map.manage");
    const mode = form.get("mode") === "sostituisci" ? "sostituisci" : "aggiungi";
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Scegli il file della mappa (.json).");
    if (file.size > 10 * 1024 * 1024) throw new UserError("File troppo grande (massimo 10 MB).");
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      throw new UserError("Il file non è un JSON valido.");
    }
    const parsed = importFile.safeParse(raw);
    if (!parsed.success) throw new UserError("Questo non è un file di backup della mappa del gestionale.");

    // razze e manti si ritrovano per nome (senza distinzione tra maiuscole/minuscole)
    const breeds = await prisma.breed.findMany({ include: { coats: true } });
    const norm = (s: string) => s.trim().toLowerCase();
    const breedBy = new Map(breeds.map((b) => [norm(b.name), b]));
    const users = await prisma.user.findMany({ select: { id: true, username: true } });
    const userBy = new Map(users.map((u) => [u.username.toLowerCase(), u.id]));

    const rows: Prisma.SpawnCreateManyInput[] = [];
    let invalid = 0;
    let unknownBreed = 0;
    for (const p of parsed.data.punti) {
      const r = importPoint.safeParse(p);
      if (!r.success) { invalid++; continue; }
      const d = r.data;
      let breedId: number | null = null;
      let coatId: number | null = null;
      if (d.razza && d.tipo !== "NOTA") {
        const b = breedBy.get(norm(d.razza));
        if (b) {
          breedId = b.id;
          if (d.manto) coatId = b.coats.find((c) => norm(c.name) === norm(d.manto!))?.id ?? null;
        } else unknownBreed++;
      }
      // un cavallo senza razza riconosciuta diventa "possibile" (da verificare), così non va perso
      const kind = d.tipo === "CAVALLO" && !breedId ? "POSSIBILE" : d.tipo;
      rows.push({
        kind, x: d.x, y: d.y, breedId, coatId,
        title: kind === "NOTA" || kind === "RARO" || kind === "LEGGENDARIO" ? d.titolo ?? (kind === "NOTA" ? "Nota" : null) : null,
        color: kind === "NOTA" ? d.colore ?? NOTE_COLORS[0] : null,
        location: d.posizione ?? null, description: d.descrizione ?? null, notes: d.note ?? null,
        createdById: (d.autore && userBy.get(d.autore.toLowerCase())) || user.id,
      });
    }
    if (!rows.length) throw new UserError("Nel file non c'è nessun punto valido.");

    let backupFile: string | null = null;
    let skipped = 0;
    let toCreate = rows;
    if (mode === "sostituisci") {
      backupFile = (await writeBackup("prima-import-mappa")).file;
    } else {
      // salta i punti già presenti (stesso tipo, stessa posizione entro mezzo pixel, stesso cavallo o titolo)
      const existing = await prisma.spawn.findMany({ select: { kind: true, x: true, y: true, breedId: true, coatId: true, title: true } });
      toCreate = rows.filter((r) => {
        const dup = existing.some((e) => e.kind === r.kind && Math.abs(e.x - r.x) < 0.5 && Math.abs(e.y - r.y) < 0.5 && e.breedId === (r.breedId ?? null) && e.coatId === (r.coatId ?? null) && (e.title ?? null) === (r.title ?? null));
        if (dup) skipped++;
        return !dup;
      });
    }

    await prisma.$transaction(async (tx) => {
      if (mode === "sostituisci") await tx.spawn.deleteMany();
      if (toCreate.length) await tx.spawn.createMany({ data: toCreate });
      const cats = parsed.data.categorieNote;
      if (cats && Object.keys(cats).length) {
        const clean = Object.fromEntries(Object.entries(cats).filter(([c]) => NOTE_COLORS.includes(c)));
        await tx.setting.upsert({ where: { key: "mapNoteNames" }, create: { key: "mapNoteNames", value: JSON.stringify(clean) }, update: { value: JSON.stringify(clean) } });
      }
      await audit(user, "IMPORTA_MAPPA", "Mappa", null,
        `Importati ${toCreate.length} punti (${mode})${skipped ? `, ${skipped} già presenti` : ""}${backupFile ? `. Backup: ${backupFile}` : ""}`, undefined, tx);
    });
    revalidatePath("/mappa");
    const extra = [
      skipped ? `${skipped} già presenti saltati` : null,
      invalid ? `${invalid} righe non valide ignorate` : null,
      unknownBreed ? `${unknownBreed} con razza non presente nel catalogo (segnati senza razza)` : null,
    ].filter(Boolean).join(", ");
    return { ok: true, message: `${mode === "sostituisci" ? "Mappa sostituita" : "Punti aggiunti"}: ${toCreate.length}${extra ? ` · ${extra}` : ""}.` };
  });
}
