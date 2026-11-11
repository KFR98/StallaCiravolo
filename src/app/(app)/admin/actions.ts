"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission, hashPassword } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { DEFAULT_SETTINGS, getSettings, type Settings } from "@/lib/settings";
import { currentAge } from "@/lib/age";
import { saveImage, deleteUpload } from "@/lib/uploads";
import { parseListino, type ParsedListino } from "@/lib/excel-import";
import { applyListino } from "@/lib/catalog-import";
import { ROLES } from "@/lib/permissions";

// ─────────────────────────── UTENTI ───────────────────────────

const pwSchema = z.string().min(8, "La password deve avere almeno 8 caratteri").max(200);

export async function createUser(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.manage");
    const f = fd(form);
    const data = z
      .object({
        username: z.string().trim().min(3, "Nome utente: almeno 3 caratteri").max(50).regex(/^[a-zA-Z0-9._-]+$/, "Nome utente: solo lettere, numeri, punto, trattino"),
        displayName: z.string().trim().min(2, "Inserisci il nome in gioco").max(100),
        role: z.enum(ROLES as [string, ...string[]]),
        password: pwSchema,
      })
      .parse({ username: f.str("username"), displayName: f.str("displayName"), role: f.str("role"), password: f.str("password") });
    const u = await prisma.user.create({
      data: { username: data.username, displayName: data.displayName, role: data.role as never, passwordHash: await hashPassword(data.password) },
    });
    await audit(actor, "CREA_UTENTE", "Utente", u.id, `Creato utente ${u.username} (${u.role})`);
    return { ok: true, message: `Account ${u.username} creato.` };
  });
}

export async function updateUser(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.manage");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const data = z
      .object({
        displayName: z.string().trim().min(2).max(100),
        role: z.enum(ROLES as [string, ...string[]]),
        active: z.boolean(),
        notes: z.string().max(2000).nullable(),
      })
      .parse({ displayName: f.str("displayName"), role: f.str("role"), active: f.bool("active"), notes: f.opt("notes") });
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new UserError("Utente non trovato.");
    if (before.id === actor.id && (data.role !== "ADMIN" || !data.active)) throw new UserError("Non puoi togliere a te stesso il ruolo admin o disattivarti.");
    if (before.role === "ADMIN" && (data.role !== "ADMIN" || !data.active)) {
      const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
      if (admins <= 1) throw new UserError("Deve restare almeno un amministratore attivo.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { ...data, role: data.role as never } });
      if (!data.active) await tx.session.deleteMany({ where: { userId: id } });
      await audit(actor, "MODIFICA_UTENTE", "Utente", id, `Modificato utente ${before.username}`, {
        prima: { displayName: before.displayName, role: before.role, active: before.active },
        dopo: data,
      }, tx);
    });
    return { ok: true, message: "Utente aggiornato." };
  });
}

export async function resetPassword(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.manage");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const pw = pwSchema.parse(f.str("password"));
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw new UserError("Utente non trovato.");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw) } });
      // Chiude le sessioni attive dell'utente (tranne la propria se si cambia la propria password)
      if (id !== actor.id) await tx.session.deleteMany({ where: { userId: id } });
      await audit(actor, "RESET_PASSWORD", "Utente", id, `Password reimpostata per ${u.username}`, undefined, tx);
    });
    return { ok: true, message: "Password aggiornata." };
  });
}

/** Conteggio di tutti i dati collegati a un utente (anteprima prima dell'eliminazione). */
export async function userDataSummary(userId: number) {
  await assertPermission("users.delete");
  const horseIds = (await prisma.horse.findMany({ where: { OR: [{ capturedById: userId }, { ownerId: userId }] }, select: { id: true } })).map((h) => h.id);
  const [sales, salesOnHorses, itemSales, spawns, reservations, payroll, reimb, notes, logs] = await Promise.all([
    prisma.sale.count({ where: { sellerId: userId } }),
    prisma.sale.count({ where: { horseId: { in: horseIds }, NOT: { sellerId: userId } } }),
    prisma.itemSale.count({ where: { sellerId: userId } }),
    prisma.spawn.count({ where: { createdById: userId } }),
    prisma.reservation.count({ where: { createdById: userId } }),
    prisma.payrollEntry.count({ where: { userId } }),
    prisma.reimbursement.count({ where: { userId } }),
    prisma.shopNote.count({ where: { createdById: userId } }),
    prisma.auditLog.count({ where: { userId } }),
  ]);
  return { horses: horseIds.length, sales, salesOnHorses, itemSales, spawns, reservations, payroll, reimb, notes, logs };
}

/** Elimina definitivamente un utente e TUTTO ciò che lo riguarda. */
export async function deleteUserCompletely(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.delete");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw new UserError("Utente non trovato.");
    if (u.id === actor.id) throw new UserError("Non puoi eliminare il tuo account.");
    if (f.str("conferma") !== u.username) throw new UserError(`Per confermare scrivi esattamente il nome utente: ${u.username}`);
    if (u.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN", active: true, NOT: { id } } })) === 0) throw new UserError("Deve restare almeno un amministratore.");
    const summary = await userDataSummary(id);
    await prisma.$transaction(async (tx) => {
      const horseIds = (await tx.horse.findMany({ where: { OR: [{ capturedById: id }, { ownerId: id }] }, select: { id: true } })).map((h) => h.id);
      // Cavalli di altri venduti dall'utente: restano nello storico come usciti
      await tx.horse.updateMany({ where: { id: { notIn: horseIds }, sales: { some: { sellerId: id } } }, data: { status: "RIMOSSO", exitReason: "Vendita eliminata insieme all'utente" } });
      // Vendite dell'utente e vendite dei cavalli che riguardano l'utente
      await tx.sale.deleteMany({ where: { OR: [{ sellerId: id }, { horseId: { in: horseIds } }] } });
      await tx.horseTransfer.deleteMany({ where: { OR: [{ fromUserId: id }, { toUserId: id }, { byUserId: id }, { horseId: { in: horseIds } }] } });
      await tx.horse.deleteMany({ where: { id: { in: horseIds } } });
      await tx.itemSale.deleteMany({ where: { sellerId: id } });
      await tx.spawn.deleteMany({ where: { createdById: id } });
      await tx.spawn.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
      await tx.reservation.deleteMany({ where: { createdById: id } });
      await tx.reservation.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.reservation.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
      await tx.payment.deleteMany({ where: { userId: id } });
      await tx.payrollEntry.deleteMany({ where: { userId: id } });
      await tx.reimbursement.deleteMany({ where: { userId: id } });
      await tx.shopNote.deleteMany({ where: { createdById: id } });
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
      await audit(actor, "ELIMINA_UTENTE", "Utente", id, `Eliminato definitivamente l'utente ${u.username} (${u.displayName}) e tutti i suoi dati`, summary, tx);
    }, { timeout: 60_000 });
    return { ok: true, message: `Utente ${u.username} eliminato con tutti i suoi dati.` };
  });
}

// ─────────────────────────── CATALOGO ───────────────────────────

export async function saveBreed(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const f = fd(form);
    const id = f.int("id");
    const data = z
      .object({
        name: z.string().trim().min(2, "Nome razza obbligatorio").max(120),
        description: z.string().max(5000).nullable(),
        isCustom: z.boolean(),
        sortOrder: z.number().int().min(0).max(100000),
        archived: z.boolean(),
      })
      .parse({ name: f.str("name"), description: f.opt("description"), isCustom: f.bool("isCustom"), sortOrder: f.int("sortOrder") ?? 0, archived: f.bool("archived") });
    if (id) {
      const before = await prisma.breed.findUnique({ where: { id } });
      if (!before) throw new UserError("Razza non trovata.");
      await prisma.breed.update({ where: { id }, data });
      await audit(actor, "MODIFICA_RAZZA", "Razza", id, `Modificata razza ${data.name}`, { prima: before, dopo: data });
      return { ok: true, message: "Razza aggiornata." };
    }
    const b = await prisma.breed.create({ data });
    await audit(actor, "CREA_RAZZA", "Razza", b.id, `Creata razza ${b.name}`);
    return { ok: true, message: "Razza creata." };
  });
}

export async function deleteBreed(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const id = fd(form).int("id") ?? 0;
    const b = await prisma.breed.findUnique({ where: { id }, include: { _count: { select: { horses: true } }, coats: true } });
    if (!b) throw new UserError("Razza non trovata.");
    if (b._count.horses > 0) throw new UserError("Ci sono cavalli registrati di questa razza: archiviala invece di eliminarla.");
    await prisma.$transaction(async (tx) => {
      for (const c of b.coats) await tx.coat.delete({ where: { id: c.id } });
      await tx.breed.delete({ where: { id } });
      await audit(actor, "ELIMINA_RAZZA", "Razza", id, `Eliminata razza ${b.name} (${b.coats.length} manti)`, b, tx);
    });
    for (const c of b.coats) await deleteUpload(c.imagePath);
    return { ok: true, message: "Razza eliminata.", redirect: "/admin/catalogo" };
  });
}

const PRICE_FIELDS = ["govListPrice", "basePriceA", "basePriceB", "trainingPrice", "salePriceA", "salePriceB", "governmentPrice"] as const;

export async function saveCoat(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const f = fd(form);
    const id = f.int("id");
    const base = z
      .object({
        breedId: z.number().int().positive("Seleziona la razza"),
        name: z.string().trim().min(1, "Nome manto obbligatorio").max(120),
        description: z.string().max(5000).nullable(),
        notes: z.string().max(5000).nullable(),
        sortOrder: z.number().int().min(0).max(100000),
        archived: z.boolean(),
      })
      .parse({ breedId: f.int("breedId"), name: f.str("name"), description: f.opt("description"), notes: f.opt("notes"), sortOrder: f.int("sortOrder") ?? 0, archived: f.bool("archived") });
    const prices: Record<string, number | null> = {};
    for (const k of PRICE_FIELDS) {
      const v = f.num(k);
      if (v != null && (Number.isNaN(v) || v < 0)) throw new UserError("Prezzi non validi.");
      prices[k] = v;
    }
    const stats = await prisma.statDefinition.findMany();
    const statValues = stats.map((s) => {
      const v = f.num("stat_" + s.id);
      if (v != null && (Number.isNaN(v) || v < 0 || v > 1000)) throw new UserError(`Valore non valido per ${s.label}.`);
      return { statId: s.id, value: v };
    });
    const image = form.get("image");
    const removeImage = f.bool("removeImage");

    const result = await prisma.$transaction(async (tx) => {
      let coatId: number;
      let oldImage: string | null = null;
      if (id) {
        const before = await tx.coat.findUnique({ where: { id } });
        if (!before) throw new UserError("Manto non trovato.");
        oldImage = before.imagePath;
        for (const k of PRICE_FIELDS) {
          const o = before[k] == null ? null : Number(before[k]);
          if (o !== prices[k]) await tx.priceHistory.create({ data: { coatId: id, field: k, oldValue: o, newValue: prices[k], changedById: actor.id } });
        }
        await tx.coat.update({ where: { id }, data: { ...base, ...prices } });
        coatId = id;
        await audit(actor, "MODIFICA_MANTO", "Manto", id, `Modificato manto ${base.name}`, {
          prima: { name: before.name, ...Object.fromEntries(PRICE_FIELDS.map((k) => [k, before[k] == null ? null : Number(before[k])])) },
          dopo: { name: base.name, ...prices, stats: statValues },
        }, tx);
      } else {
        const c = await tx.coat.create({ data: { ...base, ...prices } });
        coatId = c.id;
        await audit(actor, "CREA_MANTO", "Manto", c.id, `Creato manto ${base.name}`, undefined, tx);
      }
      for (const sv of statValues) {
        await tx.coatStat.upsert({ where: { coatId_statId: { coatId, statId: sv.statId } }, create: { coatId, ...sv }, update: { value: sv.value } });
      }
      return { coatId, oldImage };
    });

    if (image instanceof File && image.size > 0) {
      let rel: string;
      try {
        rel = await saveImage(image, "coats", String(result.coatId));
      } catch (e) {
        throw new UserError((e as Error).message);
      }
      await prisma.coat.update({ where: { id: result.coatId }, data: { imagePath: rel } });
      await deleteUpload(result.oldImage);
      await audit(actor, "IMMAGINE_MANTO", "Manto", result.coatId, `Nuova immagine per ${base.name}`);
    } else if (removeImage && result.oldImage) {
      await prisma.coat.update({ where: { id: result.coatId }, data: { imagePath: null } });
      await deleteUpload(result.oldImage);
      await audit(actor, "IMMAGINE_MANTO", "Manto", result.coatId, `Immagine rimossa per ${base.name}`);
    }
    return { ok: true, message: id ? "Manto aggiornato." : "Manto creato.", redirect: id ? undefined : `/admin/catalogo/manto/${result.coatId}` };
  });
}

export async function deleteCoat(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const id = fd(form).int("id") ?? 0;
    const c = await prisma.coat.findUnique({ where: { id }, include: { _count: { select: { horses: true } } } });
    if (!c) throw new UserError("Manto non trovato.");
    if (c._count.horses > 0) throw new UserError("Ci sono cavalli registrati con questo manto: archivialo invece di eliminarlo.");
    await prisma.coat.delete({ where: { id } });
    await deleteUpload(c.imagePath);
    await audit(actor, "ELIMINA_MANTO", "Manto", id, `Eliminato manto ${c.name}`, c);
    return { ok: true, message: "Manto eliminato.", redirect: "/admin/catalogo" };
  });
}

export async function saveStats(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const f = fd(form);
    const defs = await prisma.statDefinition.findMany();
    await prisma.$transaction(async (tx) => {
      for (const d of defs) {
        const label = f.str("label_" + d.id);
        const order = f.int("order_" + d.id);
        if (!label) throw new UserError("Le etichette non possono essere vuote.");
        await tx.statDefinition.update({ where: { id: d.id }, data: { label: label.slice(0, 60), sortOrder: order ?? d.sortOrder } });
      }
      const nl = f.str("newLabel");
      if (nl) {
        const key = nl.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "stat";
        await tx.statDefinition.create({ data: { key: key + "_" + Date.now().toString(36), label: nl.slice(0, 60), sortOrder: defs.length } });
      }
      await audit(actor, "MODIFICA_STATISTICHE", "Statistiche", null, "Aggiornate etichette statistiche" + (nl ? ` (+ ${nl})` : ""), undefined, tx);
    });
    return { ok: true, message: "Statistiche aggiornate." };
  });
}

// ─────────────────────────── IMPOSTAZIONI ───────────────────────────

export async function saveSettings(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("settings.manage");
    const f = fd(form);
    const next = z
      .object({
        stableName: z.string().trim().min(2).max(60),
        daysPerYear: z.number().positive("I giorni per anno devono essere maggiori di zero").max(365),
        minSaleAge: z.number().min(0).max(60),
        bracketAMax: z.number().int().min(0).max(60),
        bracketBMax: z.number().int().min(0).max(80),
        defaultCaptureAge: z.number().min(0).max(60),
        pctStable: z.number().min(0).max(100),
        pctGov: z.number().min(0).max(100),
        pctItems: z.number().min(0).max(100),
        maxDiscountPercent: z.number().min(0).max(100),
        pregnancyDays: z.number().min(0.1, "Giorni di gravidanza non validi").max(60),
        backupDays: z.number().int().min(1).max(365),
      })
      .refine((s) => s.bracketBMax > s.bracketAMax, { message: "La fascia 11-16 deve terminare dopo la fascia 5-10." })
      .parse({
        stableName: f.str("stableName"),
        daysPerYear: f.num("daysPerYear"),
        minSaleAge: f.num("minSaleAge"),
        bracketAMax: f.int("bracketAMax"),
        bracketBMax: f.int("bracketBMax"),
        defaultCaptureAge: f.num("defaultCaptureAge"),
        pctStable: f.num("pctStable"),
        pctGov: f.num("pctGov"),
        pctItems: f.num("pctItems"),
        maxDiscountPercent: f.num("maxDiscountPercent"),
        pregnancyDays: f.num("pregnancyDays"),
        backupDays: f.int("backupDays"),
      }) satisfies Partial<Settings>;
    const prev = await getSettings();
    const now = new Date();
    let frozen = 0;
    await prisma.$transaction(async (tx) => {
      // Cambio della velocità di invecchiamento: si congela l'età maturata finora
      if (next.daysPerYear !== prev.daysPerYear) {
        const horses = await tx.horse.findMany({ where: { status: "IN_STALLA" }, select: { id: true, ageBase: true, ageCheckpointAt: true } });
        for (const h of horses) {
          const age = currentAge(Number(h.ageBase), h.ageCheckpointAt, prev.daysPerYear, now);
          await tx.horse.update({ where: { id: h.id }, data: { ageBase: Math.round(age * 1000) / 1000, ageCheckpointAt: now } });
        }
        frozen = horses.length;
      }
      for (const [key, value] of Object.entries(next)) {
        if (!(key in DEFAULT_SETTINGS)) continue;
        await tx.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
      }
      const changed = Object.fromEntries(
        Object.entries(next).filter(([k, v]) => prev[k as keyof Settings] !== v).map(([k, v]) => [k, { da: prev[k as keyof Settings], a: v }]),
      );
      await audit(actor, "IMPOSTAZIONI", "Impostazioni", null, `Impostazioni modificate: ${Object.keys(changed).join(", ") || "nessuna modifica"}`, { ...changed, cavalliRicalcolati: frozen }, tx);
    });
    return { ok: true, message: frozen ? `Impostazioni salvate. Età maturata conservata per ${frozen} cavalli.` : "Impostazioni salvate." };
  });
}

// ─────────────────────────── IMPORT EXCEL ───────────────────────────

export async function previewImport(form: FormData) {
  return run(async () => {
    await assertPermission("data.import");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Seleziona il file Excel.");
    if (file.size > 15 * 1024 * 1024) throw new UserError("File troppo grande.");
    let parsed: ParsedListino;
    try {
      parsed = await parseListino(Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      throw new UserError("Impossibile leggere il file: " + (e as Error).message);
    }
    // Confronto con il database attuale
    const existing = await prisma.coat.findMany({ include: { breed: true } });
    const keys = new Set(existing.map((c) => (c.breed.name + "|" + c.name).toUpperCase()));
    const newCoats = parsed.rows.filter((r) => !keys.has((r.breedName + "|" + r.coatName).toUpperCase())).length;
    return { ok: true, message: "File analizzato: controlla il riepilogo prima di importare.", data: { parsed, newCoats, existingCoats: parsed.rows.length - newCoats } };
  });
}

export async function confirmImport(payload: string, mode: "solo_nuovi" | "aggiorna") {
  return run(async () => {
    const actor = await assertPermission("data.import");
    const parsed = JSON.parse(payload) as ParsedListino;
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.statColumns)) throw new UserError("Dati di importazione non validi.");
    const r = await applyListino(parsed, mode, actor);
    return { ok: true, message: `Importazione completata: ${r.breedsCreated} razze e ${r.coatsCreated} manti nuovi, ${r.coatsUpdated} aggiornati, ${r.coatsSkipped} invariati.` };
  });
}
