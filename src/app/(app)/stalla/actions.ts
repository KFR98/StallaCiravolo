"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { horsePricing, horseAge } from "@/lib/horses";
import { applyDiscount, bracketLabel, round2 } from "@/lib/pricing";
import { fromZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/format";

const DAY = 86400_000;

/** Solo chi ha il cavallo in carico (o admin/direttore) può venderlo, trasferirlo o gestirne la gravidanza. */
function assertOwner(user: CurrentUser, horse: { ownerId: number }) {
  if (horse.ownerId !== user.id && !can(user.role, "horses.manageAll")) {
    throw new UserError("Questo cavallo è in carico a un altro stalliere: solo lui (o la direzione) può farlo.");
  }
}

const baseSchema = z.object({
  breedId: z.number({ message: "Scegli razza e manto" }).int().positive("Scegli razza e manto"),
  coatId: z.number({ message: "Scegli razza e manto" }).int().positive("Scegli razza e manto"),
  requestId: z.string().min(8).max(64),
  mode: z.enum(["DEPOSITA", "GOVERNO"]),
  notes: z.string().max(2000).nullable(),
});

/** Registrazione cattura: deposito in stalla oppure vendita immediata al blip del Governo. */
export async function captureHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.capture");
    const f = fd(form);
    const base = baseSchema.parse({
      breedId: f.int("breedId") ?? undefined,
      coatId: f.int("coatId") ?? undefined,
      requestId: f.str("requestId"),
      mode: f.str("mode"),
      notes: f.opt("notes"),
    });
    // Per la vendita al blip bastano razza e manto; il resto è facoltativo
    const extra = z
      .object({
        age: base.mode === "DEPOSITA" ? z.number({ message: "Indica l'età" }).min(0, "Età non valida").max(60, "Età non valida") : z.number().min(0).max(60).nullable(),
        sex: base.mode === "DEPOSITA" ? z.enum(["MASCHIO", "FEMMINA"], { message: "Indica il sesso" }) : z.enum(["MASCHIO", "FEMMINA"]).nullable(),
        plate: base.mode === "DEPOSITA" ? z.string().trim().min(1, "Inserisci la targa").max(40) : z.string().trim().max(40).nullable(),
      })
      .parse({
        age: f.num("age") ?? (base.mode === "DEPOSITA" ? undefined : null),
        sex: f.str("sex") || (base.mode === "DEPOSITA" ? undefined : null),
        plate: f.str("plate").toUpperCase() || (base.mode === "DEPOSITA" ? "" : null),
      });

    const dup = await prisma.horse.findUnique({ where: { requestId: base.requestId } });
    if (dup) return { ok: true, message: "Registrazione già effettuata." };

    const coat = await prisma.coat.findFirst({ where: { id: base.coatId, breedId: base.breedId, archived: false }, include: { breed: true } });
    if (!coat) throw new UserError("Il manto non appartiene alla razza selezionata.");
    const now = new Date();
    const ip = await clientIp();

    if (base.mode === "GOVERNO") {
      if (coat.governmentPrice == null) throw new UserError("Per questo manto non è impostato il prezzo di vendita al blip. Avvisa l'amministratore.");
      const sale = await prisma.$transaction(async (tx) => {
        const horse = await tx.horse.create({
          data: {
            breedId: coat.breedId, coatId: coat.id, sex: extra.sex, plate: extra.plate, status: "VENDUTO_GOVERNO", notes: base.notes,
            ageBase: extra.age, initialAge: extra.age, ageCheckpointAt: now, capturedById: user.id, ownerId: user.id, capturedAt: now,
            exitedAt: now, exitReason: "Venduto al blip del Governo", requestId: base.requestId,
          },
        });
        const sale = await tx.sale.create({
          data: {
            horseId: horse.id, type: "GOVERNO", breedName: coat.breed.name, coatName: coat.name, sex: extra.sex, plate: extra.plate,
            ageAtSale: extra.age, priceBracket: "Blip Governo", listPrice: coat.governmentPrice, finalPrice: coat.governmentPrice!,
            sellerId: user.id, sellerName: user.displayName, notes: base.notes, soldAt: now,
          },
        });
        await audit(user, "VENDITA_GOVERNO", "Vendita", sale.id, `${coat.breed.name} – ${coat.name} venduto al blip per ${Number(coat.governmentPrice)}`, { horseId: horse.id }, tx, ip);
        return sale;
      });
      return { ok: true, message: `Venduto al blip per $${Number(sale.finalPrice)}.` };
    }

    const samePlate = await prisma.horse.findFirst({ where: { plate: extra.plate!, status: "IN_STALLA" } });
    if (samePlate) throw new UserError(`In stalla c'è già un cavallo con targa ${extra.plate}.`);
    const horse = await prisma.$transaction(async (tx) => {
      const h = await tx.horse.create({
        data: {
          breedId: coat.breedId, coatId: coat.id, sex: extra.sex, plate: extra.plate, status: "IN_STALLA", condition: "Sano", notes: base.notes,
          ageBase: extra.age, initialAge: extra.age, ageCheckpointAt: now, capturedById: user.id, ownerId: user.id, capturedAt: now,
          depositedAt: now, requestId: base.requestId,
        },
      });
      await audit(user, "DEPOSITO", "Cavallo", h.id, `${coat.breed.name} – ${coat.name} (${extra.plate}) depositato in stalla`, undefined, tx, ip);
      return h;
    });
    return { ok: true, message: "Cavallo depositato in stalla.", redirect: `/stalla/${horse.id}` };
  });
}

const sellSchema = z.object({
  horseId: z.number().int().positive(),
  version: z.number().int().min(0),
  discountType: z.enum(["PERCENTUALE", "IMPORTO"]).nullable(),
  discountValue: z.number().min(0, "Sconto non valido").nullable(),
  manualPrice: z.number().min(0, "Prezzo non valido").nullable(),
  buyerName: z.string().max(120).nullable(),
  notes: z.string().max(2000).nullable(),
});

/** Vendita di un cavallo in stalla. Protetta contro vendite doppie/concorrenti. */
export async function sellHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.sell");
    const f = fd(form);
    const data = sellSchema.parse({
      horseId: f.int("horseId"),
      version: f.int("version"),
      discountType: (f.str("discountType") || null) as "PERCENTUALE" | "IMPORTO" | null,
      discountValue: f.num("discountValue"),
      manualPrice: f.num("manualPrice"),
      buyerName: f.opt("buyerName"),
      notes: f.opt("notes"),
    });
    const s = await getSettings();
    const horse = await prisma.horse.findUnique({ where: { id: data.horseId }, include: { coat: true, breed: true } });
    if (!horse) throw new UserError("Cavallo non trovato.");
    if (horse.status !== "IN_STALLA") throw new UserError("Il cavallo non è più disponibile in stalla.");
    assertOwner(user, horse);

    const now = new Date();
    const { age, bracket, listPrice } = horsePricing(horse, s, now);
    if (bracket === "TROPPO_GIOVANE") throw new UserError(`Il cavallo ha ${age.toFixed(1)} anni: si può vendere solo dai ${s.minSaleAge} anni.`);
    const override = can(user.role, "sales.overridePrice");
    let base: number;
    if (bracket === "LIBERO" || listPrice == null) {
      if (data.manualPrice == null) throw new UserError("Per questa fascia d'età il prezzo lo decide lo stalliere: inseriscilo.");
      base = data.manualPrice;
    } else if (data.manualPrice != null && data.manualPrice !== listPrice) {
      if (!override) throw new UserError("Solo direttore e admin possono cambiare il prezzo di listino. Usa lo sconto.");
      base = data.manualPrice;
    } else base = listPrice;

    if (data.discountType && data.discountValue) {
      if (data.discountType === "PERCENTUALE" && data.discountValue > 100) throw new UserError("Lo sconto non può superare il 100%.");
      if (data.discountType === "IMPORTO" && data.discountValue > base) throw new UserError("Lo sconto non può superare il prezzo.");
      const pct = data.discountType === "PERCENTUALE" ? data.discountValue : (data.discountValue / Math.max(base, 0.01)) * 100;
      if (!override && pct > s.maxDiscountPercent + 1e-9) throw new UserError(`Sconto massimo consentito: ${s.maxDiscountPercent}%.`);
    }
    const finalPrice = applyDiscount(base, data.discountValue ? data.discountType : null, data.discountValue);
    const ip = await clientIp();

    const sale = await prisma.$transaction(async (tx) => {
      const locked = await tx.horse.updateMany({
        where: { id: horse.id, status: "IN_STALLA", version: data.version },
        data: { status: "VENDUTO", exitedAt: now, exitReason: "Venduto", version: { increment: 1 } },
      });
      if (locked.count !== 1) throw new UserError("Il cavallo è appena stato venduto o modificato da un altro utente. Ricarica la pagina.");
      const sale = await tx.sale.create({
        data: {
          horseId: horse.id, type: "STALLA", breedName: horse.breed.name, coatName: horse.coat.name, sex: horse.sex, plate: horse.plate,
          ageAtSale: round2(age), priceBracket: bracketLabel(bracket, s), listPrice: base,
          discountType: data.discountValue ? data.discountType : null, discountValue: data.discountValue || null, finalPrice,
          sellerId: user.id, sellerName: user.displayName, buyerName: data.buyerName,
          notes: [data.notes, horse.pregnancyDueAt ? "Venduta incinta" : null].filter(Boolean).join(" · ") || null, soldAt: now,
        },
      });
      await audit(user, "VENDITA", "Vendita", sale.id, `${horse.breed.name} – ${horse.coat.name} (${horse.plate}) venduto per ${finalPrice}${horse.pregnancyDueAt ? " (incinta)" : ""}`, { horseId: horse.id, listino: listPrice, base, finale: finalPrice }, tx, ip);
      return sale;
    });
    return { ok: true, message: `Vendita registrata: $${Number(sale.finalPrice)}.`, redirect: "/vendite?evidenzia=" + sale.id };
  });
}

/** Passaggio gratuito del cavallo a un altro stalliere. */
export async function transferHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.view");
    const f = fd(form);
    const horseId = f.int("horseId") ?? 0;
    const toId = z.number({ message: "Scegli lo stalliere" }).int().positive("Scegli lo stalliere").parse(f.int("toUserId"));
    const notes = f.opt("notes");
    const horse = await prisma.horse.findUnique({ where: { id: horseId }, include: { owner: true } });
    if (!horse || horse.status !== "IN_STALLA") throw new UserError("Il cavallo non è in stalla.");
    assertOwner(user, horse);
    if (toId === horse.ownerId) throw new UserError("Il cavallo è già in carico a questo stalliere.");
    const to = await prisma.user.findFirst({ where: { id: toId, active: true } });
    if (!to) throw new UserError("Stalliere non trovato o disattivato.");
    await prisma.$transaction(async (tx) => {
      const r = await tx.horse.updateMany({ where: { id: horse.id, ownerId: horse.ownerId, status: "IN_STALLA" }, data: { ownerId: to.id, version: { increment: 1 } } });
      if (r.count !== 1) throw new UserError("Il cavallo è stato appena modificato. Ricarica la pagina.");
      await tx.horseTransfer.create({ data: { horseId: horse.id, fromUserId: horse.ownerId, toUserId: to.id, byUserId: user.id, notes } });
      await audit(user, "TRASFERIMENTO", "Cavallo", horse.id, `Cavallo ${horse.plate} passato da ${horse.owner.displayName} a ${to.displayName}`, { notes }, tx);
    });
    return { ok: true, message: `Cavallo passato a ${to.displayName}.` };
  });
}

/** Segna la cavalla come incinta (solo cavalli in stalla). */
export async function setPregnant(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.view");
    const f = fd(form);
    const horseId = f.int("horseId") ?? 0;
    const s = await getSettings();
    const horse = await prisma.horse.findUnique({ where: { id: horseId } });
    if (!horse || horse.status !== "IN_STALLA") throw new UserError("Si può segnare incinta solo una cavalla presente in stalla.");
    if (horse.sex !== "FEMMINA") throw new UserError("Solo le femmine possono essere segnate incinte.");
    assertOwner(user, horse);
    const sinceStr = f.str("since");
    const since = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sinceStr) ? fromZonedTime(sinceStr + ":00", TZ) : new Date();
    const dueAt = new Date(since.getTime() + s.pregnancyDays * DAY);
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({ where: { id: horseId }, data: { pregnantSince: since, pregnancyDueAt: dueAt, version: { increment: 1 } } });
      await audit(user, "GRAVIDANZA", "Cavallo", horseId, `Cavalla ${horse.plate} accoppiata: incinta (parto previsto tra ${s.pregnancyDays} giorni)`, undefined, tx);
    });
    return { ok: true, message: "Segnata come INCINTA." };
  });
}

/** Modifica la data prevista del parto, oppure chiude la gravidanza. */
export async function updatePregnancy(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.view");
    const f = fd(form);
    const horseId = f.int("horseId") ?? 0;
    const op = f.str("op");
    const horse = await prisma.horse.findUnique({ where: { id: horseId } });
    if (!horse || !horse.pregnantSince) throw new UserError("Il cavallo non risulta incinto.");
    assertOwner(user, horse);
    if (op === "parto_ora") {
      await prisma.horse.update({ where: { id: horseId }, data: { pregnancyDueAt: new Date() } });
      await audit(user, "GRAVIDANZA", "Cavallo", horseId, `Cavalla ${horse.plate}: pronta a partorire`);
      return { ok: true, message: "Stato aggiornato: FAI PARTORIRE." };
    }
    if (op === "chiudi") {
      const reason = f.str("reason") || "Partorito";
      await prisma.horse.update({ where: { id: horseId }, data: { pregnantSince: null, pregnancyDueAt: null } });
      await audit(user, "GRAVIDANZA", "Cavallo", horseId, `Cavalla ${horse.plate}: gravidanza chiusa (${reason})`);
      return { ok: true, message: reason === "Partorito" ? "Parto registrato." : "Gravidanza annullata." };
    }
    const dueStr = f.str("dueAt");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueStr)) throw new UserError("Data del parto non valida.");
    const dueAt = fromZonedTime(dueStr + ":00", TZ);
    await prisma.horse.update({ where: { id: horseId }, data: { pregnancyDueAt: dueAt } });
    await audit(user, "GRAVIDANZA", "Cavallo", horseId, `Cavalla ${horse.plate}: data parto modificata`);
    return { ok: true, message: "Data del parto aggiornata." };
  });
}

/** Modifica dati operativi (gestore/direttore/admin). */
export async function updateHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.edit");
    const f = fd(form);
    const id = f.int("horseId");
    const data = z
      .object({ condition: z.string().max(60).nullable(), notes: z.string().max(2000).nullable(), plate: z.string().trim().min(1, "Targa obbligatoria").max(40) })
      .parse({ condition: f.opt("condition"), notes: f.opt("notes"), plate: f.str("plate").toUpperCase() });
    const before = await prisma.horse.findUnique({ where: { id: id ?? 0 } });
    if (!before) throw new UserError("Cavallo non trovato.");
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } });
      await audit(user, "MODIFICA_CAVALLO", "Cavallo", before.id, `Modificati dati del cavallo ${before.plate}`, { prima: { condition: before.condition, notes: before.notes, plate: before.plate }, dopo: data }, tx);
    });
    return { ok: true, message: "Scheda aggiornata." };
  });
}

/** Correzione amministrativa: razza, manto, sesso, età, catturatore. */
export async function correctHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.correct");
    const f = fd(form);
    const id = f.int("horseId") ?? 0;
    const data = z
      .object({
        coatId: z.number({ message: "Scegli il manto" }).int().positive("Scegli il manto"),
        sex: z.enum(["MASCHIO", "FEMMINA"]).nullable(),
        age: z.number().min(0).max(60).nullable(),
        capturedById: z.number().int().positive(),
      })
      .parse({ coatId: f.int("coatId"), sex: f.str("sex") || null, age: f.num("age"), capturedById: f.int("capturedById") });
    const before = await prisma.horse.findUnique({ where: { id } });
    if (!before) throw new UserError("Cavallo non trovato.");
    const coat = await prisma.coat.findUnique({ where: { id: data.coatId } });
    if (!coat) throw new UserError("Manto non trovato.");
    const s = await getSettings();
    const ageBefore = horseAge(before, s);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({
        where: { id },
        data: {
          coatId: coat.id, breedId: coat.breedId, sex: data.sex, capturedById: data.capturedById,
          ...(data.age != null && (ageBefore == null || Math.abs(data.age - ageBefore) > 0.0001) ? { ageBase: data.age, ageCheckpointAt: now } : {}),
          version: { increment: 1 },
        },
      });
      await audit(user, "CORREZIONE_CAVALLO", "Cavallo", id, `Correzione amministrativa cavallo ${before.plate ?? "#" + id}`, {
        prima: { coatId: before.coatId, sex: before.sex, eta: ageBefore == null ? null : round2(ageBefore), capturedById: before.capturedById },
        dopo: { coatId: coat.id, sex: data.sex, eta: data.age, capturedById: data.capturedById },
      }, tx);
    });
    return { ok: true, message: "Correzione salvata." };
  });
}

/** Uscita dalla stalla senza vendita. */
export async function removeHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.edit");
    const f = fd(form);
    const id = f.int("horseId") ?? 0;
    const reason = z.string().trim().min(3, "Indica il motivo dell'uscita").max(255).parse(f.str("reason"));
    const done = await prisma.$transaction(async (tx) => {
      const r = await tx.horse.updateMany({ where: { id, status: "IN_STALLA" }, data: { status: "RIMOSSO", exitedAt: new Date(), exitReason: reason, version: { increment: 1 } } });
      if (r.count === 1) await audit(user, "USCITA_CAVALLO", "Cavallo", id, `Cavallo uscito dalla stalla: ${reason}`, undefined, tx);
      return r.count === 1;
    });
    if (!done) throw new UserError("Il cavallo non è più in stalla.");
    return { ok: true, message: "Cavallo rimosso dalla stalla (resta nello storico).", redirect: "/stalla" };
  });
}

/** Riporta in stalla un cavallo uscito per errore (solo admin). */
export async function restoreHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.correct");
    const id = fd(form).int("horseId") ?? 0;
    const h = await prisma.horse.findUnique({ where: { id }, include: { sales: { where: { voided: false } } } });
    if (!h || h.status !== "RIMOSSO") throw new UserError("Solo i cavalli usciti senza vendita possono essere ripristinati.");
    if (h.sales.length) throw new UserError("Il cavallo ha una vendita valida: annulla prima la vendita.");
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({ where: { id }, data: { status: "IN_STALLA", exitedAt: null, exitReason: null, version: { increment: 1 } } });
      await audit(user, "RIPRISTINO_CAVALLO", "Cavallo", id, `Cavallo ${h.plate} riportato in stalla`, undefined, tx);
    });
    return { ok: true, message: "Cavallo riportato in stalla." };
  });
}
