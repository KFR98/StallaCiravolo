"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { horsePricing, horseAge } from "@/lib/horses";
import { applyDiscount, bracketLabel, round2 } from "@/lib/pricing";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/format";

const DAY = 86400_000;

/**
 * Data e ora della cattura scelte nel modulo (ora di Roma). Vuota = adesso.
 * Si può retrodatare (es. cavallo registrato in ritardo), non mettere nel futuro.
 * Quanti giorni indietro si può andare lo decide l'admin in Impostazioni (dipendenti / chi corregge i dati).
 */
function parseCaptureDate(raw: string, maxDays: number): Date {
  const now = new Date();
  if (!raw) return now;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new UserError("Data della cattura non valida.");
  const d = fromZonedTime(raw + ":00", TZ);
  if (d.getTime() > now.getTime() + 2 * 60_000) throw new UserError("La data della cattura non può essere nel futuro.");
  if (d.getTime() < now.getTime() - maxDays * DAY) throw new UserError(`La data della cattura può essere al massimo ${maxDays} giorni fa.`);
  return d;
}

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
        rarity: z.enum(["RARO", "LEGGENDARIO"]).nullable(),
        age: base.mode === "DEPOSITA" ? z.number({ message: "Indica l'età" }).min(0, "Età non valida").max(60, "Età non valida") : z.number().min(0).max(60).nullable(),
        sex: base.mode === "DEPOSITA" ? z.enum(["MASCHIO", "FEMMINA"], { message: "Indica il sesso" }) : z.enum(["MASCHIO", "FEMMINA"]).nullable(),
        plate: base.mode === "DEPOSITA" ? z.string().trim().min(1, "Inserisci la targa").max(40) : z.string().trim().max(40).nullable(),
      })
      .parse({
        rarity: base.mode === "DEPOSITA" ? f.str("rarity") || null : null,
        age: f.num("age") ?? (base.mode === "DEPOSITA" ? undefined : null),
        sex: f.str("sex") || (base.mode === "DEPOSITA" ? undefined : null),
        plate: f.str("plate").toUpperCase() || (base.mode === "DEPOSITA" ? "" : null),
      });

    const dup = await prisma.horse.findUnique({ where: { requestId: base.requestId } });
    if (dup) return { ok: true, message: "Registrazione già effettuata." };
    // data di cattura: di base adesso, modificabile se il cavallo è stato registrato in ritardo
    const cs = await getSettings();
    const capturedAt = parseCaptureDate(f.str("capturedAt"), can(user.role, "horses.correct") ? cs.captureBackdateDaysAdmin : cs.captureBackdateDays);
    const backdated = Date.now() - capturedAt.getTime() > 5 * 60_000;

    const coat = await prisma.coat.findFirst({ where: { id: base.coatId, breedId: base.breedId, archived: false }, include: { breed: true } });
    if (!coat) throw new UserError("Il manto non appartiene alla razza selezionata.");
    const now = capturedAt;
    const ip = await clientIp();
    const late = backdated ? ` (cattura del ${formatInTimeZone(capturedAt, TZ, "dd/MM/yyyy HH:mm")}, registrata in ritardo)` : "";

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
        await audit(user, "VENDITA_GOVERNO", "Vendita", sale.id, `${coat.breed.name} – ${coat.name} venduto al blip per ${Number(coat.governmentPrice)}${late}`, { horseId: horse.id }, tx, ip);
        return sale;
      });
      return { ok: true, message: `Venduto al blip per $${Number(sale.finalPrice)}.` };
    }

    const samePlate = await prisma.horse.findFirst({ where: { plate: extra.plate!, status: "IN_STALLA" } });
    if (samePlate) throw new UserError(`In stalla c'è già un cavallo con targa ${extra.plate}.`);
    const horse = await prisma.$transaction(async (tx) => {
      const h = await tx.horse.create({
        data: {
          breedId: coat.breedId, coatId: coat.id, sex: extra.sex, plate: extra.plate, status: "IN_STALLA", condition: "Sano", notes: base.notes, rarity: extra.rarity,
          ageBase: extra.age, initialAge: extra.age, ageCheckpointAt: now, capturedById: user.id, ownerId: user.id, capturedAt: now,
          depositedAt: now, requestId: base.requestId,
        },
      });
      await audit(user, "DEPOSITO", "Cavallo", h.id, `${extra.rarity ? (extra.rarity === "RARO" ? "RARO " : "LEGGENDARIO ") : ""}${coat.breed.name} – ${coat.name} (${extra.plate}) depositato in stalla${late}`, undefined, tx, ip);
      return h;
    });
    return { ok: true, message: "Cavallo depositato in stalla.", redirect: `/stalla/${horse.id}` };
  });
}

const sellSchema = z.object({
  horseId: z.number().int().positive(),
  version: z.number().int().min(0),
  /** Fascia scelta: di base quella dell'età calcolata, cambiabile se l'età è sbagliata */
  bracket: z.enum(["A", "B", "LIBERO"]),
  withTraining: z.boolean(),
  discountType: z.enum(["PERCENTUALE", "IMPORTO"]).nullable(),
  discountValue: z.number().min(0, "Sconto non valido").nullable(),
  manualPrice: z.number().min(0, "Prezzo non valido").nullable(),
  items: z.array(z.object({ id: z.number().int().positive(), qty: z.number().int().min(1).max(99) })).max(40),
  buyerName: z.string().max(120).nullable(),
  notes: z.string().max(2000).nullable(),
});

/**
 * Vendita di un cavallo in stalla. Protetta contro vendite doppie/concorrenti.
 * Prezzo = base della fascia (+ addestramento se scelto) − sconto.
 * Ferri, sella e altri oggetti della bottega venduti insieme vengono registrati come vendita
 * di oggetti collegata (così rientrano nella percentuale "oggetti" dello stipendio).
 */
export async function sellHorse(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.sell");
    const f = fd(form);
    let items: unknown = [];
    try {
      items = JSON.parse(f.str("items") || "[]");
    } catch {
      throw new UserError("Elenco oggetti non valido.");
    }
    const data = sellSchema.parse({
      horseId: f.int("horseId"),
      version: f.int("version"),
      bracket: f.str("bracket"),
      withTraining: f.bool("withTraining"),
      discountType: (f.str("discountType") || null) as "PERCENTUALE" | "IMPORTO" | null,
      discountValue: f.num("discountValue"),
      manualPrice: f.num("manualPrice"),
      items,
      buyerName: f.opt("buyerName"),
      notes: f.opt("notes"),
    });
    const s = await getSettings();
    const horse = await prisma.horse.findUnique({ where: { id: data.horseId }, include: { coat: true, breed: true } });
    if (!horse) throw new UserError("Cavallo non trovato.");
    if (horse.status !== "IN_STALLA") throw new UserError("Il cavallo non è più disponibile in stalla.");
    assertOwner(user, horse);

    if (horse.needsData) throw new UserError("Prima completa i dati del puledro (targa e sesso).");
    const now = new Date();
    const { age, bracket: computed } = horsePricing(horse, s, now);
    const override = can(user.role, "sales.overridePrice");
    const rare = horse.rarity === "RARO" || horse.rarity === "LEGGENDARIO";
    if (computed === "TROPPO_GIOVANE" && !can(user.role, "horses.sellUnderage")) {
      throw new UserError(`Il cavallo ha ${age.toFixed(1)} anni: si può vendere solo dai ${s.minSaleAge} anni. Se l'età è sbagliata chiedi a direttore, gestore o admin.`);
    }
    // rari e leggendari: prezzo libero deciso dal venditore (fascia d'età non usata)
    const bracket = rare ? "LIBERO" : data.bracket;
    const bracketChanged = !rare && bracket !== computed;

    const listBase = rare ? null : bracket === "A" ? horse.coat.basePriceA : bracket === "B" ? horse.coat.basePriceB : null;
    const basePrice = listBase == null ? null : Number(listBase);
    let base: number;
    if (basePrice == null) {
      if (data.manualPrice == null) throw new UserError("Per questa fascia il prezzo lo decide lo stalliere: inseriscilo.");
      base = data.manualPrice;
    } else if (data.manualPrice != null && data.manualPrice !== basePrice) {
      if (!override) throw new UserError("Solo direttore e admin possono cambiare il prezzo di listino. Usa lo sconto.");
      base = data.manualPrice;
    } else base = basePrice;
    // già addestrato in stalla: l'addestramento è compreso nel prezzo e non si può aggiungere di nuovo
    const withTraining = horse.trained || data.withTraining;
    if (!rare && withTraining && horse.coat.trainingPrice == null) throw new UserError("Per questo manto non c'è un prezzo di addestramento nel listino.");
    const training = !withTraining ? 0 : rare ? s.rareTrainingPrice : Number(horse.coat.trainingPrice);
    const horsePrice = round2(base + training);

    if (data.discountType && data.discountValue) {
      if (data.discountType === "PERCENTUALE" && data.discountValue > 100) throw new UserError("Lo sconto non può superare il 100%.");
      if (data.discountType === "IMPORTO" && data.discountValue > horsePrice) throw new UserError("Lo sconto non può superare il prezzo del cavallo.");
      const pct = data.discountType === "PERCENTUALE" ? data.discountValue : (data.discountValue / Math.max(horsePrice, 0.01)) * 100;
      if (!override && pct > s.maxDiscountPercent + 1e-9) throw new UserError(`Sconto massimo consentito: ${s.maxDiscountPercent}%.`);
    }
    const finalPrice = applyDiscount(horsePrice, data.discountValue ? data.discountType : null, data.discountValue);

    // Oggetti della bottega: i prezzi vengono dal listino della bottega, non dal browser
    const qtyById = new Map<number, number>();
    for (const it of data.items) qtyById.set(it.id, (qtyById.get(it.id) ?? 0) + it.qty);
    const shopItems = qtyById.size ? await prisma.shopItem.findMany({ where: { id: { in: [...qtyById.keys()] }, kind: "VENDITA", archived: false } }) : [];
    if (shopItems.length !== qtyById.size) throw new UserError("Uno degli oggetti scelti non è più in vendita: ricarica la pagina.");
    const lines = shopItems.map((it) => {
      if (it.price == null) throw new UserError(`“${it.name}” non ha un prezzo nella bottega.`);
      const qty = qtyById.get(it.id)!;
      return { itemId: it.id, itemName: it.name, quantity: qty, unitPrice: Number(it.price), lineTotal: round2(Number(it.price) * qty) };
    });
    const itemsTotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
    const ip = await clientIp();
    const label = `${horse.breed.name} – ${horse.coat.name}${horse.plate ? ` (${horse.plate})` : ""}`;
    const noteParts = [
      data.notes,
      horse.pregnancyDueAt ? "Venduta incinta" : null,
      bracketChanged ? `Fascia scelta a mano: ${bracketLabel(bracket, s)} (età calcolata ${age.toFixed(1)} anni)` : null,
    ].filter(Boolean);

    const sale = await prisma.$transaction(async (tx) => {
      const locked = await tx.horse.updateMany({
        where: { id: horse.id, status: "IN_STALLA", version: data.version },
        data: { status: "VENDUTO", exitedAt: now, exitReason: "Venduto", version: { increment: 1 } },
      });
      if (locked.count !== 1) throw new UserError("Il cavallo è appena stato venduto o modificato da un altro utente. Ricarica la pagina.");
      let itemSaleId: number | null = null;
      if (lines.length) {
        const is = await tx.itemSale.create({
          data: {
            sellerId: user.id, sellerName: user.displayName, buyerName: data.buyerName, total: itemsTotal, soldAt: now,
            notes: `Venduti con il cavallo ${label}`, lines: { create: lines },
          },
        });
        itemSaleId = is.id;
      }
      const created = await tx.sale.create({
        data: {
          horseId: horse.id, type: "STALLA", breedName: horse.breed.name, coatName: horse.coat.name, sex: horse.sex, plate: horse.plate,
          ageAtSale: round2(age), priceBracket: rare ? (horse.rarity === "RARO" ? "Raro · prezzo libero" : "Leggendario · prezzo libero") : bracketLabel(bracket, s), listPrice: horsePrice, basePrice: base,
          trainingPrice: training || null, itemsTotal: lines.length ? itemsTotal : null, itemSaleId,
          discountType: data.discountValue ? data.discountType : null, discountValue: data.discountValue || null, finalPrice,
          sellerId: user.id, sellerName: user.displayName, buyerName: data.buyerName,
          notes: noteParts.join(" · ") || null, soldAt: now,
        },
      });
      await audit(
        user, "VENDITA", "Vendita", created.id,
        `${label} venduto per ${finalPrice}${lines.length ? ` + oggetti ${itemsTotal}` : ""}${horse.pregnancyDueAt ? " (incinta)" : ""}`,
        { horseId: horse.id, fascia: bracket, fasciaCalcolata: computed, base, addestramento: training, finale: finalPrice, oggetti: lines.map((l) => `${l.quantity}× ${l.itemName}`) },
        tx, ip,
      );
      return created;
    });
    const tot = round2(Number(sale.finalPrice) + itemsTotal);
    return {
      ok: true,
      message: `Vendita registrata: $${tot}${itemsTotal ? ` (cavallo $${Number(sale.finalPrice)} + oggetti $${itemsTotal})` : ""}.`,
      redirect: "/vendite?evidenzia=" + sale.id,
    };
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
    if (horse.foalCount >= s.maxFoals) throw new UserError(`Questa cavalla ha già partorito ${horse.foalCount} volte: il massimo è ${s.maxFoals}.`);
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
      const reason = f.str("reason") === "Partorito" ? "Partorito" : "Annullata";
      if (reason === "Annullata") {
        await prisma.horse.update({ where: { id: horseId }, data: { pregnantSince: null, pregnancyDueAt: null } });
        await audit(user, "GRAVIDANZA", "Cavallo", horseId, `Cavalla ${horse.plate}: gravidanza annullata`);
        return { ok: true, message: "Gravidanza annullata." };
      }
      return giveBirth(user, horseId);
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
    // parti avuti (solo cavalle): correggibili se ci si è dimenticati di segnare gravidanza e parto
    const s = await getSettings();
    const foalRaw = f.int("foalCount");
    let foalCount: number | undefined;
    if (before.sex === "FEMMINA" && foalRaw != null) {
      if (foalRaw < 0 || foalRaw > s.maxFoals) throw new UserError(`I parti devono essere tra 0 e ${s.maxFoals} (massimo in Impostazioni).`);
      foalCount = foalRaw;
    }
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({ where: { id: before.id }, data: { ...data, ...(foalCount != null ? { foalCount } : {}), version: { increment: 1 } } });
      await audit(user, "MODIFICA_CAVALLO", "Cavallo", before.id, `Modificati dati del cavallo ${before.plate}${foalCount != null && foalCount !== before.foalCount ? ` (parti: ${before.foalCount} → ${foalCount})` : ""}`, { prima: { condition: before.condition, notes: before.notes, plate: before.plate, parti: before.foalCount }, dopo: { ...data, parti: foalCount ?? before.foalCount } }, tx);
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
    const capturedRaw = f.str("capturedAt");
    const before = await prisma.horse.findUnique({ where: { id } });
    if (!before) throw new UserError("Cavallo non trovato.");
    const coat = await prisma.coat.findUnique({ where: { id: data.coatId } });
    if (!coat) throw new UserError("Manto non trovato.");
    const s = await getSettings();
    const ageBefore = horseAge(before, s);
    const now = new Date();
    // nuova data di cattura (se cambiata): si spostano anche deposito, punto di partenza dell'età
    // (se l'età non era mai stata corretta) e, per le vendite al blip, la data della vendita
    const newCaptured = capturedRaw ? parseCaptureDate(capturedRaw, s.captureBackdateDaysAdmin) : null;
    const capChanged = newCaptured && Math.abs(newCaptured.getTime() - before.capturedAt.getTime()) > 60_000;
    const same = (a: Date | null, b: Date) => !!a && Math.abs(a.getTime() - b.getTime()) < 1000;
    const ageChanged = data.age != null && (ageBefore == null || Math.abs(data.age - ageBefore) > 0.0001);
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({
        where: { id },
        data: {
          coatId: coat.id, breedId: coat.breedId, sex: data.sex, capturedById: data.capturedById,
          ...(capChanged ? {
            capturedAt: newCaptured,
            ...(same(before.depositedAt, before.capturedAt) ? { depositedAt: newCaptured } : {}),
            ...(!ageChanged && same(before.ageCheckpointAt, before.capturedAt) ? { ageCheckpointAt: newCaptured } : {}),
            ...(before.status === "VENDUTO_GOVERNO" && same(before.exitedAt, before.capturedAt) ? { exitedAt: newCaptured } : {}),
          } : {}),
          ...(ageChanged ? { ageBase: data.age, ageCheckpointAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (capChanged && before.status === "VENDUTO_GOVERNO") {
        await tx.sale.updateMany({ where: { horseId: id, type: "GOVERNO" }, data: { soldAt: newCaptured } });
      }
      await audit(user, "CORREZIONE_CAVALLO", "Cavallo", id, `Correzione amministrativa cavallo ${before.plate ?? "#" + id}`, {
        prima: { coatId: before.coatId, sex: before.sex, eta: ageBefore == null ? null : round2(ageBefore), capturedById: before.capturedById, cattura: before.capturedAt },
        dopo: { coatId: coat.id, sex: data.sex, eta: data.age, capturedById: data.capturedById, cattura: capChanged ? newCaptured : before.capturedAt },
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

/**
 * Parto: la madre torna non incinta, il contatore dei parti sale e nasce un puledro in stalla.
 * Il puledro è uguale alla madre (razza e manto), in carico allo stesso stalliere, età 0 da adesso,
 * e "da completare" (targa e sesso). Se la madre è rara o leggendaria i dati li sistema la direzione.
 */
async function giveBirth(user: CurrentUser, motherId: number) {
  const s = await getSettings();
  const now = new Date();
  const ip = await clientIp();
  const result = await prisma.$transaction(async (tx) => {
    const mother = await tx.horse.findUnique({ where: { id: motherId }, include: { breed: true, coat: true } });
    if (!mother || mother.status !== "IN_STALLA" || !mother.pregnantSince) throw new UserError("La cavalla non risulta incinta in stalla.");
    if (mother.foalCount >= s.maxFoals) throw new UserError(`Questa cavalla ha già partorito ${mother.foalCount} volte: il massimo è ${s.maxFoals}.`);
    // blocco contro il doppio clic: aggiorna solo se è ancora incinta
    const locked = await tx.horse.updateMany({
      where: { id: motherId, pregnantSince: { not: null } },
      data: { pregnantSince: null, pregnancyDueAt: null, foalCount: { increment: 1 }, version: { increment: 1 } },
    });
    if (locked.count !== 1) throw new UserError("Il parto è già stato registrato.");
    const rareMother = mother.rarity === "RARO" || mother.rarity === "LEGGENDARIO";
    const foal = await tx.horse.create({
      data: {
        breedId: mother.breedId, coatId: mother.coatId, status: "IN_STALLA", condition: "Sano",
        ageBase: 0, initialAge: 0, ageCheckpointAt: now, bornAt: now,
        ownerId: mother.ownerId, capturedById: mother.ownerId, capturedAt: now, depositedAt: now,
        motherId: mother.id, needsData: true, needsStaff: rareMother,
        notes: `Nato in stalla da ${mother.plate ?? "cavalla #" + mother.id} (${mother.breed.name} – ${mother.coat.name}).`,
      },
    });
    await audit(user, "PARTO", "Cavallo", foal.id, `Parto di ${mother.plate}: nato un puledro ${mother.breed.name} – ${mother.coat.name} (parto ${mother.foalCount + 1}/${s.maxFoals})`, { madre: mother.id, puledro: foal.id }, tx, ip);
    return { foal, rareMother, count: mother.foalCount + 1 };
  });
  return {
    ok: true,
    message: result.rareMother
      ? `Parto registrato (${result.count}/${s.maxFoals}). È nato un puledro: la madre è rara, chiedi a direttore, gestore o admin di completarne i dati.`
      : `Parto registrato (${result.count}/${s.maxFoals}). È nato un puledro: aggiungi la targa e il sesso.`,
    redirect: `/stalla/${result.foal.id}`,
  };
}

const foalSchema = z.object({
  horseId: z.number().int().positive(),
  plate: z.string().trim().min(1, "Inserisci la targa").max(40),
  sex: z.enum(["MASCHIO", "FEMMINA"], { message: "Indica il sesso" }),
  birth: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable(),
  breedId: z.number().int().positive().nullable(),
  coatId: z.number().int().positive().nullable(),
  rarity: z.enum(["RARO", "LEGGENDARIO"]).nullable(),
});

/**
 * Completa i dati di un puledro nato in stalla: targa, sesso e (una sola volta) data e ora di nascita.
 * Per i puledri di madri rare/leggendarie servono direttore, gestore o admin (permesso "horses.edit"),
 * che possono anche correggere razza, manto e rarità.
 */
export async function completeFoal(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.view");
    const f = fd(form);
    const data = foalSchema.parse({
      horseId: f.int("horseId"), plate: f.str("plate").toUpperCase(), sex: f.str("sex") || undefined,
      birth: f.str("birth") || null, breedId: f.int("breedId"), coatId: f.int("coatId"), rarity: f.str("rarity") || null,
    });
    const horse = await prisma.horse.findUnique({ where: { id: data.horseId } });
    if (!horse || horse.motherId == null) throw new UserError("Puledro non trovato.");
    const staff = can(user.role, "horses.edit");
    if (horse.needsStaff && !staff) throw new UserError("Puledro di madre rara: i dati li deve completare direttore, gestore o admin.");
    if (!staff) assertOwner(user, horse);
    if (horse.status !== "IN_STALLA") throw new UserError("Il puledro non è più in stalla.");

    const upd: Prisma.HorseUpdateInput = { plate: data.plate, sex: data.sex, needsData: false, needsStaff: false, version: { increment: 1 } };
    // data e ora di nascita esatte: il proprietario le può impostare una volta sola
    if (data.birth) {
      if (horse.birthSetAt && !can(user.role, "horses.correct")) throw new UserError("Data e ora di nascita sono già state impostate: per cambiarle serve l'amministratore.");
      const born = fromZonedTime(data.birth + ":00", TZ);
      if (born.getTime() > Date.now() + 60_000) throw new UserError("La nascita non può essere nel futuro.");
      const fs = await getSettings();
      if (born.getTime() < Date.now() - fs.foalBirthMaxDays * DAY) throw new UserError(`La nascita può essere al massimo ${fs.foalBirthMaxDays} giorni fa.`);
      Object.assign(upd, { bornAt: born, ageBase: 0, initialAge: 0, ageCheckpointAt: born, birthSetAt: new Date() });
    }
    // solo la direzione corregge razza, manto e rarità (puledri di madri rare)
    if (staff && data.breedId && data.coatId) {
      const ok = await prisma.coat.count({ where: { id: data.coatId, breedId: data.breedId } });
      if (!ok) throw new UserError("Il manto non appartiene alla razza scelta.");
      Object.assign(upd, { breed: { connect: { id: data.breedId } }, coat: { connect: { id: data.coatId } } });
    }
    if (staff) upd.rarity = data.rarity;
    const samePlate = await prisma.horse.findFirst({ where: { plate: data.plate, status: "IN_STALLA", NOT: { id: horse.id } } });
    if (samePlate) throw new UserError(`In stalla c'è già un cavallo con targa ${data.plate}.`);
    await prisma.horse.update({ where: { id: horse.id }, data: upd });
    await audit(user, "DATI_PULEDRO", "Cavallo", horse.id, `Completati i dati del puledro ${data.plate}`, { ...data });
    return { ok: true, message: "Dati del puledro salvati." };
  });
}

/** Spunta "Addestrato": il cavallo è già addestrato in stalla (il prezzo base mostrato include l'addestramento). */
export async function setTrained(form: FormData) {
  return run(async () => {
    const user = await assertPermission("horses.train");
    const f = fd(form);
    const id = f.int("horseId") ?? 0;
    const on = f.str("on") === "1";
    const horse = await prisma.horse.findUnique({ where: { id }, include: { breed: true, coat: true } });
    if (!horse || horse.status !== "IN_STALLA") throw new UserError("Si può segnare solo un cavallo presente in stalla.");
    if (horse.trained === on) return { ok: true, message: on ? "Già segnato come addestrato." : "Già senza addestramento." };
    await prisma.$transaction(async (tx) => {
      await tx.horse.update({ where: { id }, data: { trained: on, trainedAt: on ? new Date() : null, trainedById: on ? user.id : null, version: { increment: 1 } } });
      await audit(user, "ADDESTRAMENTO", "Cavallo", id, `${horse.breed.name} – ${horse.coat.name} (${horse.plate ?? "#" + id}): ${on ? "segnato come addestrato" : "tolta la spunta addestrato"}`, undefined, tx);
    });
    return { ok: true, message: on ? "Segnato come addestrato: il prezzo base ora include l'addestramento." : "Tolta la spunta addestrato." };
  });
}
