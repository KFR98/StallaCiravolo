"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { horsePricing, horseAge } from "@/lib/horses";
import { applyDiscount, bracketLabel, round2 } from "@/lib/pricing";

const captureSchema = z.object({
  breedId: z.number({ message: "Seleziona la razza" }).int().positive("Seleziona la razza"),
  coatId: z.number({ message: "Seleziona il manto" }).int().positive("Seleziona il manto"),
  age: z.number({ message: "Indica l'età" }).min(0, "Età non valida").max(60, "Età non valida"),
  sex: z.enum(["MASCHIO", "FEMMINA"], { message: "Indica il sesso" }),
  plate: z.string().trim().min(1, "Inserisci la targa del server").max(40, "Targa troppo lunga"),
  notes: z.string().max(2000).nullable(),
  mode: z.enum(["DEPOSITA", "GOVERNO"]),
  requestId: z.string().min(8).max(64),
});

/** Inserimento cavallo catturato: deposito in stalla oppure vendita immediata al Governo. */
export async function captureHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.capture");
    const f = fd(form);
    const data = captureSchema.parse({
      breedId: f.int("breedId") ?? undefined,
      coatId: f.int("coatId") ?? undefined,
      age: f.num("age") ?? undefined,
      sex: f.str("sex") || undefined,
      plate: f.str("plate").toUpperCase(),
      notes: f.opt("notes"),
      mode: f.str("mode"),
      requestId: f.str("requestId"),
    });

    // Anti doppio invio: stessa richiesta già registrata
    const dup = await prisma.horse.findUnique({ where: { requestId: data.requestId } });
    if (dup) return { ok: true, message: "Registrazione già effettuata.", redirect: `/stalla/${dup.id}` };

    const coat = await prisma.coat.findFirst({
      where: { id: data.coatId, breedId: data.breedId, archived: false },
      include: { breed: true },
    });
    if (!coat) throw new UserError("Il manto non appartiene alla razza selezionata.");

    const now = new Date();
    const ip = await clientIp();

    if (data.mode === "GOVERNO") {
      if (coat.governmentPrice == null) throw new UserError("Per questo manto non è impostato il prezzo Governo. Avvisa l'amministratore.");
      const result = await prisma.$transaction(async (tx) => {
        const horse = await tx.horse.create({
          data: {
            breedId: coat.breedId,
            coatId: coat.id,
            sex: data.sex,
            plate: data.plate,
            status: "VENDUTO_GOVERNO",
            notes: data.notes,
            ageBase: data.age,
            initialAge: data.age,
            ageCheckpointAt: now,
            capturedById: user.id,
            capturedAt: now,
            exitedAt: now,
            exitReason: "Venduto al blip del Governo",
            requestId: data.requestId,
          },
        });
        const sale = await tx.sale.create({
          data: {
            horseId: horse.id,
            type: "GOVERNO",
            breedName: coat.breed.name,
            coatName: coat.name,
            sex: data.sex,
            plate: data.plate,
            ageAtSale: data.age,
            priceBracket: "Governo",
            listPrice: coat.governmentPrice,
            finalPrice: coat.governmentPrice!,
            sellerId: user.id,
            sellerName: user.displayName,
            notes: data.notes,
            soldAt: now,
          },
        });
        await audit(user, "VENDITA_GOVERNO", "Vendita", sale.id, `${coat.breed.name} – ${coat.name} (${data.plate}) venduto al Governo per ${Number(coat.governmentPrice)}`, { horseId: horse.id }, tx, ip);
        return { horse, sale };
      });
      return { ok: true, message: `Venduto al Governo per $${Number(result.sale.finalPrice)}.`, redirect: "/vendite?evidenzia=" + result.sale.id };
    }

    // Deposito in stalla
    const samePlate = await prisma.horse.findFirst({ where: { plate: data.plate, status: "IN_STALLA" } });
    if (samePlate) throw new UserError(`In stalla c'è già un cavallo con targa ${data.plate}.`);
    const horse = await prisma.$transaction(async (tx) => {
      const h = await tx.horse.create({
        data: {
          breedId: coat.breedId,
          coatId: coat.id,
          sex: data.sex,
          plate: data.plate,
          status: "IN_STALLA",
          condition: "Sano",
          notes: data.notes,
          ageBase: data.age,
          initialAge: data.age,
          ageCheckpointAt: now,
          capturedById: user.id,
          capturedAt: now,
          depositedAt: now,
          requestId: data.requestId,
        },
      });
      await audit(user, "DEPOSITO", "Cavallo", h.id, `${coat.breed.name} – ${coat.name} (${data.plate}) depositato in stalla`, undefined, tx, ip);
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

/** Vendita di un cavallo presente in stalla. Protetta contro vendite doppie/concorrenti. */
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

    const now = new Date();
    const { age, bracket, listPrice } = horsePricing(horse, s, now);
    if (bracket === "TROPPO_GIOVANE") {
      throw new UserError(`Il cavallo ha ${age.toFixed(1)} anni: si può vendere solo dai ${s.minSaleAge} anni.`);
    }
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
      const pct = data.discountType === "PERCENTUALE" ? data.discountValue : (data.discountValue / Math.max(base, 0.01)) * 100;
      if (data.discountType === "PERCENTUALE" && data.discountValue > 100) throw new UserError("Lo sconto non può superare il 100%.");
      if (data.discountType === "IMPORTO" && data.discountValue > base) throw new UserError("Lo sconto non può superare il prezzo.");
      if (!override && pct > s.maxDiscountPercent + 1e-9)
        throw new UserError(`Sconto massimo consentito: ${s.maxDiscountPercent}%.`);
    }
    const finalPrice = applyDiscount(base, data.discountValue ? data.discountType : null, data.discountValue);
    const ip = await clientIp();

    const sale = await prisma.$transaction(async (tx) => {
      // Blocco atomico: solo una richiesta può passare da IN_STALLA a VENDUTO
      const locked = await tx.horse.updateMany({
        where: { id: horse.id, status: "IN_STALLA", version: data.version },
        data: { status: "VENDUTO", exitedAt: now, exitReason: "Venduto", version: { increment: 1 } },
      });
      if (locked.count !== 1) throw new UserError("Il cavallo è appena stato venduto o modificato da un altro utente. Ricarica la pagina.");
      const sale = await tx.sale.create({
        data: {
          horseId: horse.id,
          type: "STALLA",
          breedName: horse.breed.name,
          coatName: horse.coat.name,
          sex: horse.sex,
          plate: horse.plate,
          ageAtSale: round2(age),
          priceBracket: bracketLabel(bracket, s),
          listPrice: base,
          discountType: data.discountValue ? data.discountType : null,
          discountValue: data.discountValue || null,
          finalPrice,
          sellerId: user.id,
          sellerName: user.displayName,
          buyerName: data.buyerName,
          notes: data.notes,
          soldAt: now,
        },
      });
      await audit(user, "VENDITA", "Vendita", sale.id, `${horse.breed.name} – ${horse.coat.name} (${horse.plate}) venduto per ${finalPrice}`, { horseId: horse.id, listino: listPrice, base, finale: finalPrice }, tx, ip);
      return sale;
    });
    return { ok: true, message: `Vendita registrata: $${Number(sale.finalPrice)}.`, redirect: "/vendite?evidenzia=" + sale.id };
  });
}

/** Modifica dati operativi (direttore/gestore/admin). */
export async function updateHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.edit");
    const f = fd(form);
    const id = f.int("horseId");
    const data = z
      .object({
        condition: z.string().max(60).nullable(),
        notes: z.string().max(2000).nullable(),
        plate: z.string().trim().min(1, "Targa obbligatoria").max(40),
      })
      .parse({ condition: f.opt("condition"), notes: f.opt("notes"), plate: f.str("plate").toUpperCase() });
    const before = await prisma.horse.findUnique({ where: { id: id ?? 0 } });
    if (!before) throw new UserError("Cavallo non trovato.");
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } });
      await audit(user, "MODIFICA_CAVALLO", "Cavallo", before.id, `Modificati dati del cavallo ${before.plate}`, {
        prima: { condition: before.condition, notes: before.notes, plate: before.plate },
        dopo: data,
      }, tx);
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
        coatId: z.number().int().positive("Seleziona il manto"),
        sex: z.enum(["MASCHIO", "FEMMINA"]),
        age: z.number().min(0).max(60).nullable(),
        capturedById: z.number().int().positive(),
      })
      .parse({ coatId: f.int("coatId"), sex: f.str("sex"), age: f.num("age"), capturedById: f.int("capturedById") });
    const before = await prisma.horse.findUnique({ where: { id } });
    if (!before) throw new UserError("Cavallo non trovato.");
    const coat = await prisma.coat.findUnique({ where: { id: data.coatId } });
    if (!coat) throw new UserError("Manto non trovato.");
    const s = await getSettings();
    const ageBefore = horseAge({ ...before, coat }, s);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({
        where: { id },
        data: {
          coatId: coat.id,
          breedId: coat.breedId,
          sex: data.sex,
          capturedById: data.capturedById,
          ...(data.age != null && Math.abs(data.age - ageBefore) > 0.0001 ? { ageBase: data.age, ageCheckpointAt: now } : {}),
          version: { increment: 1 },
        },
      });
      await audit(user, "CORREZIONE_CAVALLO", "Cavallo", id, `Correzione amministrativa cavallo ${before.plate}`, {
        prima: { coatId: before.coatId, sex: before.sex, eta: round2(ageBefore), capturedById: before.capturedById },
        dopo: { coatId: coat.id, sex: data.sex, eta: data.age, capturedById: data.capturedById },
      }, tx);
    });
    return { ok: true, message: "Correzione salvata." };
  });
}

/** Uscita dalla stalla senza vendita (morte, liberazione, trasferimento...). */
export async function removeHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.edit");
    const f = fd(form);
    const id = f.int("horseId") ?? 0;
    const reason = z.string().trim().min(3, "Indica il motivo dell'uscita").max(255).parse(f.str("reason"));
    const done = await prisma.$transaction(async (tx) => {
      const r = await tx.horse.updateMany({
        where: { id, status: "IN_STALLA" },
        data: { status: "RIMOSSO", exitedAt: new Date(), exitReason: reason, version: { increment: 1 } },
      });
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

