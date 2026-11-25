"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertPermission, hashPassword } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { isDiscordInvite } from "@/lib/discord";
import { NAV_CHOICE_KEYS } from "@/lib/nav-keys";
import { DEFAULT_SETTINGS, getSettings, type Settings } from "@/lib/settings";
import { currentAge } from "@/lib/age";
import { saveImage, saveImageBuffer, deleteUpload, maxImageMB } from "@/lib/uploads";
import { fetchRemoteImage } from "@/lib/remote-image";
import { parseListino, type ParsedListino } from "@/lib/excel-import";
import { applyListino } from "@/lib/catalog-import";
import { ADMIN_ROLE, roleWithin } from "@/lib/permissions";
import { STABLE_SORTS } from "../stalla/sorts";

// ─────────────────────────── UTENTI ───────────────────────────

const pwSchema = z.string().min(8, "La password deve avere almeno 8 caratteri").max(200);

/** Il ruolo deve esistere; il ruolo Amministratore lo può dare solo un amministratore. */
async function checkAssignableRole(actor: { role: string }, role: string) {
  if (!(await prisma.appRole.findUnique({ where: { key: role } }))) throw new UserError("Ruolo inesistente.");
  if (role === ADMIN_ROLE && actor.role !== ADMIN_ROLE) throw new UserError("Solo un amministratore può dare il ruolo di amministratore.");
  if (!roleWithin(actor.role, role)) throw new UserError("Puoi assegnare solo ruoli che non hanno più permessi del tuo.");
}

/** Chi non è amministratore può gestire solo utenti con permessi uguali o inferiori ai propri. */
function assertCanManageUser(actor: { id: number; role: string }, target: { id: number; role: string }) {
  if (actor.role === ADMIN_ROLE || actor.id === target.id) return;
  if (!roleWithin(actor.role, target.role)) throw new UserError("Puoi gestire solo utenti con permessi uguali o inferiori ai tuoi.");
}

export async function createUser(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.manage");
    const f = fd(form);
    const data = z
      .object({
        username: z.string().trim().min(3, "Nome utente: almeno 3 caratteri").max(50).regex(/^[a-zA-Z0-9._-]+$/, "Nome utente: solo lettere, numeri, punto, trattino"),
        displayName: z.string().trim().min(2, "Inserisci il nome in gioco").max(100),
        role: z.string().min(1).max(40),
        password: pwSchema,
      })
      .parse({ username: f.str("username"), displayName: f.str("displayName"), role: f.str("role"), password: f.str("password") });
    await checkAssignableRole(actor, data.role);
    const u = await prisma.user.create({
      data: { username: data.username, displayName: data.displayName, role: data.role, passwordHash: await hashPassword(data.password) },
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
        username: z.string().trim().min(3, "Nome utente: almeno 3 caratteri").max(50).regex(/^[a-zA-Z0-9._-]+$/, "Nome utente: solo lettere, numeri, punto, trattino"),
        displayName: z.string().trim().min(2).max(100),
        role: z.string().min(1).max(40),
        active: z.boolean(),
        notes: z.string().max(2000).nullable(),
      })
      .parse({ username: f.str("username"), displayName: f.str("displayName"), role: f.str("role"), active: f.bool("active"), notes: f.opt("notes") });
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new UserError("Utente non trovato.");
    if (before.deletedAt) throw new UserError("Questo utente è stato eliminato: non si può più modificare né riattivare.");
    assertCanManageUser(actor, before);
    if (before.id === actor.id && data.role !== before.role && actor.role !== ADMIN_ROLE) throw new UserError("Non puoi cambiare il tuo ruolo.");
    if (data.role !== before.role) await checkAssignableRole(actor, data.role);
    if (before.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE) throw new UserError("Solo un amministratore può modificare un altro amministratore.");
    // Un amministratore non si può disattivare: ne deve restare sempre almeno uno attivo per poter entrare
    if (data.role === "ADMIN" && !data.active) throw new UserError("Un amministratore non può essere disattivato. Se serve, cambia prima il suo ruolo.");
    if (before.id === actor.id && data.role !== "ADMIN") throw new UserError("Non puoi togliere a te stesso il ruolo di amministratore.");
    if (before.role === "ADMIN" && data.role !== "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", active: true, NOT: { id } } });
      if (admins < 1) throw new UserError("Deve restare almeno un amministratore attivo.");
    }
    if (data.username !== before.username && (await prisma.user.findUnique({ where: { username: data.username } }))) throw new UserError("Nome utente già in uso.");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { ...data, role: data.role } });
      if (!data.active) await tx.session.deleteMany({ where: { userId: id } });
      await audit(actor, "MODIFICA_UTENTE", "Utente", id, `Modificato utente ${before.username}${data.username !== before.username ? ` → ${data.username}` : ""}`, {
        prima: { username: before.username, displayName: before.displayName, role: before.role, active: before.active },
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
    if (u.deletedAt) throw new UserError("Questo utente è stato eliminato: non può più entrare.");
    // nessuno può prendere il controllo di un account più potente del proprio (es. un amministratore)
    if (u.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE) throw new UserError("Solo un amministratore può reimpostare la password di un amministratore.");
    assertCanManageUser(actor, u);
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
  const actor = await assertPermission("users.delete");
  if (!Number.isInteger(userId) || userId <= 0) throw new UserError("Utente non valido.");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target) throw new UserError("Utente non trovato.");
  assertCanManageUser(actor, target);
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
  const stableHorses = await prisma.horse.count({ where: { ownerId: userId, status: "IN_STALLA" } });
  return { horses: horseIds.length, stableHorses, sales, salesOnHorses, itemSales, spawns, reservations, payroll, reimb, notes, logs };
}

/** Azzera la doppia verifica di un utente (es. ha perso il telefono e i codici di recupero): al prossimo accesso la riattiva. */
export async function resetTwoFactor(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.manage");
    const id = fd(form).int("id") ?? 0;
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.deletedAt) throw new UserError("Utente non trovato.");
    if (u.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE) throw new UserError("Solo un amministratore può azzerare la doppia verifica di un amministratore.");
    assertCanManageUser(actor, u);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null, totpRecovery: null, totpLastStep: null } });
      // chi era dentro deve rientrare (e, se il ruolo la richiede, riattivarla)
      await tx.session.deleteMany({ where: { userId: id } });
      await audit(actor, "DOPPIA_VERIFICA_TOLTA", "Utente", id, `Azzerata la doppia verifica di ${u.username}`, undefined, tx);
    });
    return { ok: true, message: `Doppia verifica di ${u.displayName} azzerata: al prossimo accesso la riattiverà.` };
  });
}

/**
 * Elimina l'utente MANTENENDO lo storico: l'account viene chiuso per sempre (non può più entrare
 * né essere riattivato), ma vendite, cavalli, stipendi e registro restano con il suo nome.
 * I cavalli che ha ancora in stalla passano a un collega scelto.
 */
export async function archiveUser(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.delete");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw new UserError("Utente non trovato.");
    if (u.deletedAt) throw new UserError("Utente già eliminato.");
    if (u.id === actor.id) throw new UserError("Non puoi eliminare il tuo stesso account.");
    if (u.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE) throw new UserError("Solo un amministratore può eliminare un amministratore.");
    assertCanManageUser(actor, u);
    if (f.str("conferma") !== u.username) throw new UserError(`Per confermare scrivi esattamente il nome utente: ${u.username}`);
    if (u.role === ADMIN_ROLE && (await prisma.user.count({ where: { role: ADMIN_ROLE, active: true, deletedAt: null, NOT: { id } } })) === 0) throw new UserError("Deve restare almeno un amministratore.");
    const stable = await prisma.horse.findMany({ where: { ownerId: id, status: "IN_STALLA" }, select: { id: true } });
    let to: { id: number; displayName: string } | null = null;
    if (stable.length) {
      const toId = f.int("moveTo");
      to = toId ? await prisma.user.findFirst({ where: { id: toId, active: true, deletedAt: null, NOT: { id } }, select: { id: true, displayName: true } }) : null;
      if (!to) throw new UserError(`Ha ${stable.length} cavalli in stalla: scegli a chi passarli.`);
    }
    const summary = await userDataSummary(id);
    await prisma.$transaction(async (tx) => {
      if (to) {
        await tx.horse.updateMany({ where: { ownerId: id, status: "IN_STALLA" }, data: { ownerId: to.id, version: { increment: 1 } } });
        await tx.horseTransfer.createMany({ data: stable.map((h) => ({ horseId: h.id, fromUserId: id, toUserId: to!.id, byUserId: actor.id, notes: `Utente ${u.displayName} eliminato` })) });
      }
      await tx.reservation.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.user.update({
        where: { id },
        data: {
          active: false, deletedAt: new Date(), shoutText: null,
          // il nome utente si libera (si può riusare per un nuovo account); la password diventa inutilizzabile
          username: `eliminato-${id}-${u.username}`.slice(0, 50),
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        },
      });
      await audit(actor, "ELIMINA_UTENTE", "Utente", id,
        `Eliminato l'utente ${u.username} (${u.displayName}) mantenendo lo storico${to ? `; ${stable.length} cavalli passati a ${to.displayName}` : ""}`,
        { modalità: "storico conservato", ...summary }, tx);
    });
    return { ok: true, message: `Utente ${u.displayName} eliminato. Il suo storico resta.` };
  });
}

/** Elimina definitivamente un utente e TUTTO ciò che lo riguarda. */
export async function deleteUserCompletely(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("users.delete");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const u = await prisma.user.findUnique({ where: { id } });
    if (u && u.id === actor.id) throw new UserError("Non puoi eliminare il tuo stesso account.");
    if (u && u.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE) throw new UserError("Solo un amministratore può eliminare un amministratore.");
    if (u) assertCanManageUser(actor, u);
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

/** Elimina una statistica e i suoi valori da tutti i manti. */
export async function deleteStat(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const id = fd(form).int("id") ?? 0;
    const d = await prisma.statDefinition.findUnique({ where: { id }, include: { _count: { select: { values: true } } } });
    if (!d) throw new UserError("Statistica non trovata.");
    await prisma.statDefinition.delete({ where: { id } });
    await audit(actor, "ELIMINA_STATISTICA", "Statistiche", id, `Eliminata la statistica ${d.label} (${d._count.values} valori)`);
    return { ok: true, message: `Statistica ${d.label} eliminata.` };
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
        discordStyle: z.enum(["avorio", "rossa", "nera"], { message: "Scegli il colore del pulsante Discord" }),
        discordUrl: z
          .string()
          .trim()
          .max(200)
          .refine((u) => u === "" || isDiscordInvite(u), { message: "Il link Discord deve essere un invito https://discord.gg/… oppure https://discord.com/invite/…" }),
        daysPerYear: z.number().positive("I giorni per anno devono essere maggiori di zero").max(365),
        minSaleAge: z.number().min(0).max(60),
        bracketAMax: z.number().int().min(0).max(60),
        bracketBMax: z.number().int().min(0).max(80),
        defaultCaptureAge: z.number().min(0).max(60),
        pctStable: z.number().min(0).max(100),
        pctGov: z.number().min(0).max(100),
        pctItems: z.number().min(0).max(100),
        maxDiscountPercent: z.number().min(0).max(100),
        pregnancyDays: z.number({ message: "Indica i giorni di gravidanza" }).min(0.1, "Giorni di gravidanza non validi").max(60),
        maxFoals: z.number({ message: "Indica i parti massimi" }).int("I parti massimi devono essere un numero intero").min(0).max(20),
        foalMaxAge: z.number({ message: "Indica fino a che età un cavallo è puledro" }).min(0).max(60),
        rareBasePrice: z.number({ message: "Indica il prezzo base dei rari" }).min(0).max(1_000_000),
        rareTrainingPrice: z.number({ message: "Indica l'addestramento dei rari" }).min(0).max(1_000_000),
        rareColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore dei rari non valido"),
        trainingPayrollCategory: z.enum(["stable", "items"]),
        navBadges: z.object({ stalla: z.boolean(), bottega: z.boolean(), bacheca: z.boolean(), personale: z.boolean(), admin: z.boolean() }),
        notifyBell: z.boolean(),
        notifyDots: z.boolean(),
        notifyListMax: z.number({ message: "Indica quante notifiche mostrare per sezione" }).int().min(1, "Almeno 1").max(100, "Al massimo 100"),
        notifyAuditHours: z.number({ message: "Indica per quante ore restano le notifiche del registro" }).int().min(1, "Almeno 1 ora").max(720, "Al massimo 720 ore (30 giorni)"),
        cashCountGov: z.boolean(),
        customersAutoCreate: z.boolean(),
        twoFactorRoles: z.array(z.string().max(40)).max(50),
        mobileNav: z.array(z.enum(NAV_CHOICE_KEYS as [string, ...string[]])).length(4).refine((a) => new Set(a).size === 4, { message: "Nella barra del telefono ogni voce va scelta una volta sola." }),
        cashCountPayroll: z.boolean(),
        cashCountReimbursements: z.boolean(),
        saleLabelColors: z.object({
          cavallo: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore dell'etichetta Cavallo non valido"),
          addestramento: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore dell'etichetta Addestramento non valido"),
          vetrina: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore dell'etichetta Vetrina non valido"),
          blip: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore dell'etichetta Blip non valido"),
        }),
        legendaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore dei leggendari non valido"),
        captureBackdateDays: z.number({ message: "Indica i giorni di retrodatazione" }).int().min(0).max(3650),
        captureBackdateDaysAdmin: z.number({ message: "Indica i giorni di retrodatazione" }).int().min(0).max(3650),
        foalBirthMaxDays: z.number({ message: "Indica i giorni per la nascita" }).int().min(1).max(3650),
        shoeClassicItemId: z.number().int().min(0),
        shoeImprovedItemId: z.number().int().min(0),
        scoreCapture: z.number().min(0).max(1000),
        scoreStableSale: z.number().min(0).max(1000),
        scoreGovSale: z.number().min(0).max(1000),
        scoreItemSale: z.number().min(0).max(1000),
        scorePer100: z.number().min(0).max(1000),
        loginMaxAttempts: z.number().int().min(1, "Almeno 1 tentativo").max(1000),
        loginLockMinutes: z.number().int().min(1).max(10080),
        loginMaxAttemptsUser: z.number().int().min(1).max(10000),
        loginUserLockMinutes: z.number().int().min(1).max(10080),
        sessionDays: z.number().min(0.1, "Sessione troppo corta").max(365),
        maxImageMB: z.number().min(0.5).max(50),
        shoutMaxLength: z.number({ message: "Indica la lunghezza dello strillone" }).int().min(20).max(5000),
        compareMax: z.number({ message: "Indica quanti cavalli si possono confrontare" }).int().min(2, "Almeno 2 cavalli").max(8, "Al massimo 8 cavalli"),
        stableDefaultSort: z.enum(STABLE_SORTS.map(([k]) => k) as [string, ...string[]]),
        backupDays: z.number({ message: "Indica per quanti giorni conservare i backup" }).int("I giorni di conservazione devono essere un numero intero").min(1).max(365),
        backupAuto: z.boolean(),
        auditIpAll: z.boolean(),
        backupEveryHours: z.number({ message: "Indica ogni quante ore fare il backup" }).int().min(1, "Minimo 1 ora").max(168, "Massimo 7 giorni (168 ore)"),
      })
      .refine((s) => s.bracketBMax > s.bracketAMax, { message: "La fascia 11-16 deve terminare dopo la fascia 5-10." })
      .parse({
        stableName: f.str("stableName"),
        discordUrl: f.str("discordUrl"),
        discordStyle: f.str("discordStyle"),
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
        maxFoals: f.int("maxFoals"),
        foalMaxAge: f.num("foalMaxAge"),
        rareBasePrice: f.num("rareBasePrice"),
        rareTrainingPrice: f.num("rareTrainingPrice"),
        rareColor: f.str("rareColor"),
        trainingPayrollCategory: f.str("trainingPayrollCategory"),
        navBadges: { stalla: f.bool("navBadge_stalla"), bottega: f.bool("navBadge_bottega"), bacheca: f.bool("navBadge_bacheca"), personale: f.bool("navBadge_personale"), admin: f.bool("navBadge_admin") },
        notifyBell: f.bool("notifyBell"),
        notifyDots: f.bool("notifyDots"),
        notifyListMax: f.int("notifyListMax"),
        notifyAuditHours: f.int("notifyAuditHours"),
        cashCountGov: f.bool("cashCountGov"),
        customersAutoCreate: f.bool("customersAutoCreate"),
        mobileNav: [0, 1, 2, 3].map((i) => f.str(`mobileNav_${i}`)),
        twoFactorRoles: form.getAll("twoFactorRoles").map(String),
        cashCountPayroll: f.bool("cashCountPayroll"),
        cashCountReimbursements: f.bool("cashCountReimbursements"),
        saleLabelColors: { cavallo: f.str("saleColor_cavallo"), addestramento: f.str("saleColor_addestramento"), vetrina: f.str("saleColor_vetrina"), blip: f.str("saleColor_blip") },
        legendaryColor: f.str("legendaryColor"),
        captureBackdateDays: f.int("captureBackdateDays"),
        captureBackdateDaysAdmin: f.int("captureBackdateDaysAdmin"),
        foalBirthMaxDays: f.int("foalBirthMaxDays"),
        shoeClassicItemId: f.int("shoeClassicItemId") ?? 0,
        shoeImprovedItemId: f.int("shoeImprovedItemId") ?? 0,
        scoreCapture: f.num("scoreCapture"),
        scoreStableSale: f.num("scoreStableSale"),
        scoreGovSale: f.num("scoreGovSale"),
        scoreItemSale: f.num("scoreItemSale"),
        scorePer100: f.num("scorePer100"),
        loginMaxAttempts: f.int("loginMaxAttempts"),
        loginLockMinutes: f.int("loginLockMinutes"),
        loginMaxAttemptsUser: f.int("loginMaxAttemptsUser"),
        loginUserLockMinutes: f.int("loginUserLockMinutes"),
        sessionDays: f.num("sessionDays"),
        maxImageMB: f.num("maxImageMB"),
        shoutMaxLength: f.int("shoutMaxLength"),
        compareMax: f.int("compareMax"),
        stableDefaultSort: f.str("stableDefaultSort"),
        backupDays: f.int("backupDays"),
        backupAuto: f.bool("backupAuto"),
        auditIpAll: f.bool("auditIpAll"),
        backupEveryHours: f.int("backupEveryHours"),
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
      // doppia verifica: solo ruoli che esistono; chi entra in un ruolo appena reso obbligatorio e non l'ha attivata deve rientrare
      const roleKeys = new Set((await tx.appRole.findMany({ select: { key: true } })).map((r) => r.key));
      next.twoFactorRoles = [...new Set(next.twoFactorRoles.filter((k) => roleKeys.has(k)))];
      const newlyRequired = next.twoFactorRoles.filter((k) => !prev.twoFactorRoles.includes(k));
      if (newlyRequired.length) await tx.session.deleteMany({ where: { user: { role: { in: newlyRequired }, totpEnabledAt: null } } });
      for (const [key, value] of Object.entries(next)) {
        if (!(key in DEFAULT_SETTINGS)) continue;
        await tx.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
      }
      const changed = Object.fromEntries(
        // confronto per contenuto: liste e oggetti uguali non contano come "cambiati"
        Object.entries(next).filter(([k, v]) => JSON.stringify(prev[k as keyof Settings]) !== JSON.stringify(v)).map(([k, v]) => [k, { da: prev[k as keyof Settings], a: v }]),
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
    if (typeof payload !== "string" || payload.length > 20_000_000) throw new UserError("Dati di importazione non validi.");
    if (mode !== "solo_nuovi" && mode !== "aggiorna") throw new UserError("Modalità di importazione non valida.");
    let parsed: ParsedListino;
    try {
      parsed = JSON.parse(payload) as ParsedListino;
    } catch {
      throw new UserError("Dati di importazione non validi.");
    }
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.statColumns)) throw new UserError("Dati di importazione non validi.");
    const r = await applyListino(parsed, mode, actor);
    return { ok: true, message: `Importazione completata: ${r.breedsCreated} razze e ${r.coatsCreated} manti nuovi, ${r.coatsUpdated} aggiornati, ${r.coatsSkipped} invariati.` };
  });
}

/**
 * Foto dei manti da link: una riga per manto, "RAZZA | Manto | https://…".
 * Le immagini le scarica questo server e le salva nella sua cartella dati (non nel codice).
 */
export async function importCoatPhotos(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("catalog.manage");
    const text = String(form.get("lines") ?? "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new UserError("Incolla almeno una riga: RAZZA | Manto | link.");
    if (lines.length > 80) throw new UserError("Massimo 80 righe per volta.");
    const coats = await prisma.coat.findMany({ include: { breed: true } });
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
    const ok: string[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      const m = line.match(/^(.+?)\s*[|\t]\s*(.+?)\s*[|\t]\s*(https:\/\/\S+)$/i) ?? line.match(/^(.+?)\s{2,}(.+?)\s+(https:\/\/\S+)$/i);
      if (!m) { errors.push(`“${line.slice(0, 60)}”: formato non valido (usa RAZZA | Manto | link)`); continue; }
      const [, breedName, coatName, url] = m;
      const coat = coats.find((c) => norm(c.breed.name) === norm(breedName) && norm(c.name) === norm(coatName))
        ?? coats.find((c) => (norm(c.breed.name).startsWith(norm(breedName)) || norm(breedName).startsWith(norm(c.breed.name))) && norm(c.name) === norm(coatName));
      if (!coat) { errors.push(`${breedName} – ${coatName}: manto non trovato nel catalogo`); continue; }
      try {
        const buf = await fetchRemoteImage(url, (await maxImageMB()) * 1024 * 1024);
        const rel = await saveImageBuffer(buf, "coats", String(coat.id));
        await prisma.coat.update({ where: { id: coat.id }, data: { imagePath: rel } });
        await deleteUpload(coat.imagePath);
        coat.imagePath = rel;
        ok.push(`${coat.breed.name} – ${coat.name}`);
      } catch (e) {
        errors.push(`${coat.breed.name} – ${coat.name}: ${(e as Error).message}`);
      }
    }
    if (ok.length) await audit(actor, "IMMAGINI_DA_LINK", "Manto", null, `Foto da link aggiornate: ${ok.length}`, { ok, errors });
    const msg = `${ok.length} foto aggiornate.` + (errors.length ? ` Non riuscite (${errors.length}): ${errors.join(" · ")}` : "");
    if (!ok.length) return { ok: false, error: msg };
    return { ok: true, message: msg };
  });
}
