"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { can, canSeeBreed } from "@/lib/permissions";
import { quoteHorseSale } from "@/lib/horse-sale";
import { linkCustomer } from "@/lib/customers";
import { revalidatePath } from "next/cache";

// ───────── Articoli (oggetti in vendita e materie prime) ─────────
export async function saveItem(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const f = fd(form);
    const id = f.int("id");
    const data = z
      .object({
        kind: z.enum(["VENDITA", "MATERIA_PRIMA"]),
        name: z.string().trim().min(1, "Inserisci il nome").max(120),
        group: z.string().max(60).nullable(),
        subgroup: z.string().max(60, "Sottogruppo: massimo 60 caratteri").nullable(),
        price: z.number().min(0, "Prezzo non valido").nullable(),
        priceNote: z.string().max(200).nullable(),
        notes: z.string().max(1000).nullable(),
      })
      .parse({ kind: f.str("kind"), name: f.str("name"), group: f.opt("group"), subgroup: f.opt("subgroup"), price: f.num("price"), priceNote: f.opt("priceNote"), notes: f.opt("notes") });
    if (id) {
      const before = await prisma.shopItem.findUnique({ where: { id } });
      if (!before) throw new UserError("Articolo non trovato.");
      await prisma.shopItem.update({ where: { id }, data });
      await audit(user, "MODIFICA_ARTICOLO", "Bottega", id, `Modificato ${data.name}`, { prima: { prezzo: before.price?.toString(), nome: before.name }, dopo: data });
      return { ok: true, message: "Articolo aggiornato." };
    }
    const it = await prisma.shopItem.create({ data: { ...data, sortOrder: 9999 } });
    await audit(user, "NUOVO_ARTICOLO", "Bottega", it.id, `Aggiunto ${data.name}`);
    return { ok: true, message: "Articolo aggiunto." };
  });
}

export async function deleteItem(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const id = fd(form).int("id") ?? 0;
    const it = await prisma.shopItem.findUnique({ where: { id }, include: { _count: { select: { saleLines: true } } } });
    if (!it) throw new UserError("Articolo non trovato.");
    if (it._count.saleLines) await prisma.shopItem.update({ where: { id }, data: { archived: true } });
    else await prisma.shopItem.delete({ where: { id } });
    await audit(user, "ELIMINA_ARTICOLO", "Bottega", id, `${it._count.saleLines ? "Archiviato" : "Eliminato"} ${it.name}`);
    return { ok: true, message: it._count.saleLines ? "Articolo archiviato (presente in vendite passate)." : "Articolo eliminato." };
  });
}

// ───────── Fornitori ─────────
export async function saveSupplier(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const f = fd(form);
    const id = f.int("id");
    const data = z
      .object({
        name: z.string().trim().min(1, "Inserisci il nome").max(120),
        activity: z.string().max(120).nullable(),
        goods: z.string().max(300).nullable(),
        missiva: z.string().max(40).nullable(),
        starred: z.boolean(),
        notes: z.string().max(1000).nullable(),
      })
      .parse({ name: f.str("name"), activity: f.opt("activity"), goods: f.opt("goods"), missiva: f.opt("missiva"), starred: f.bool("starred"), notes: f.opt("notes") });
    if (id) {
      await prisma.supplier.update({ where: { id }, data });
      await audit(user, "MODIFICA_FORNITORE", "Bottega", id, `Modificato fornitore ${data.name}`, data);
      return { ok: true, message: "Fornitore aggiornato." };
    }
    const s = await prisma.supplier.create({ data });
    await audit(user, "NUOVO_FORNITORE", "Bottega", s.id, `Aggiunto fornitore ${data.name}`);
    return { ok: true, message: "Fornitore aggiunto." };
  });
}

export async function deleteSupplier(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const id = fd(form).int("id") ?? 0;
    const s = await prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new UserError("Fornitore non trovato.");
    await prisma.supplier.delete({ where: { id } });
    await audit(user, "ELIMINA_FORNITORE", "Bottega", id, `Eliminato fornitore ${s.name}`, s);
    return { ok: true, message: "Fornitore eliminato." };
  });
}

// ───────── Fattura della bottega: oggetti in vetrina + addestramenti di cavalli ─────────
const lineSchema = z
  .array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("item"), itemId: z.number().int().positive(), quantity: z.number().int().min(1).max(10000) }),
      z.object({
        type: z.literal("training"),
        coatId: z.number().int().positive(),
        /** cavallo in stalla: manto, rarità e targa si prendono dal cavallo (non dal browser) */
        horseId: z.number().int().positive().nullable().optional(),
        rarity: z.enum(["RARO", "LEGGENDARIO"]).nullable(),
        plate: z.string().trim().max(40).nullable(),
      }),
    ]),
  )
  .max(200, "Troppe righe in una fattura");

export async function sellItems(form: FormData) {
  return run(async () => {
    // si entra con "vendere in bottega" oppure con "vendere i propri cavalli"; sotto si controlla riga per riga
    const user = await assertPermission();
    if (!can(user.role, "shop.sell") && !can(user.role, "horses.sell")) throw new UserError("Non hai i permessi per vendere.");
    const f = fd(form);
    const requestId = z.string().min(8).max(64).parse(f.str("requestId"));
    let lines: z.infer<typeof lineSchema>;
    try {
      lines = lineSchema.parse(JSON.parse(f.str("lines") || "[]"));
    } catch (e) {
      if (e instanceof z.ZodError) throw e;
      throw new UserError("Carrello non valido.");
    }
    const dup = await prisma.itemSale.findUnique({ where: { requestId } });
    if (dup) return { ok: true, message: "Vendita già registrata." };
    const s = await getSettings();

    // Prezzi SEMPRE dal database: oggetti dal listino della bottega, addestramenti dal catalogo (o prezzo rari)
    // Addestramenti di cavalli in stalla: devono esserci, non essere già addestrati, e serve il permesso di addestrare
    const horseIds = lines.flatMap((l) => (l.type === "training" && l.horseId ? [l.horseId] : []));
    if (new Set(horseIds).size !== horseIds.length) throw new UserError("Lo stesso cavallo è nella fattura due volte.");
    if (horseIds.length && !can(user.role, "horses.train")) throw new UserError("Non puoi segnare i cavalli come addestrati.");
    const horses = horseIds.length ? await prisma.horse.findMany({ where: { id: { in: horseIds } } }) : [];
    const horseById = new Map(horses.map((h) => [h.id, h]));
    for (const id of horseIds) {
      const h = horseById.get(id);
      if (!h || h.status !== "IN_STALLA") throw new UserError("Uno dei cavalli non è più in stalla: ricarica la pagina.");
      if (h.trained) throw new UserError(`Il cavallo ${h.plate ?? "#" + h.id} è già addestrato.`);
      if (!canSeeBreed(user.role, h.breedId)) throw new UserError("Uno dei cavalli scelti non è disponibile.");
    }
    const itemIds: number[] = [];
    const coatIds: number[] = [];
    for (const l of lines) {
      if (l.type === "item") itemIds.push(l.itemId);
      else coatIds.push(l.horseId ? horseById.get(l.horseId)!.coatId : l.coatId);
    }
    const [items, coats] = await Promise.all([
      prisma.shopItem.findMany({ where: { id: { in: itemIds }, kind: "VENDITA", archived: false } }),
      prisma.coat.findMany({ where: { id: { in: coatIds }, archived: false }, include: { breed: true } }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const coatById = new Map(coats.map((c) => [c.id, c]));
    const rows = lines.map((l) => {
      if (l.type === "item") {
        const it = itemById.get(l.itemId);
        if (!it) throw new UserError("Un oggetto del carrello non è più in vendita.");
        if (it.price == null) throw new UserError(`"${it.name}" non ha un prezzo: avvisa la direzione.`);
        const unit = Number(it.price);
        return { kind: "OGGETTO", itemId: it.id, itemName: it.name, quantity: l.quantity, unitPrice: unit, lineTotal: round2(unit * l.quantity) };
      }
      const h = l.horseId ? horseById.get(l.horseId)! : null;
      const c = coatById.get(h ? h.coatId : l.coatId);
      if (!c || (!h && (c.breed.archived || !canSeeBreed(user.role, c.breedId)))) throw new UserError("Uno dei cavalli scelti non è più nel catalogo.");
      const rarity = h ? (h.rarity === "RARO" || h.rarity === "LEGGENDARIO" ? h.rarity : null) : l.rarity;
      const plate = h ? h.plate : l.plate || null;
      const price = rarity ? s.rareTrainingPrice : c.trainingPrice == null ? null : Number(c.trainingPrice);
      if (price == null) throw new UserError(`Per ${c.breed.name} – ${c.name} non c'è un prezzo di addestramento nel listino: avvisa la direzione.`);
      const rareTxt = rarity === "RARO" ? " (raro)" : rarity === "LEGGENDARIO" ? " (leggendario)" : "";
      return {
        kind: "ADDESTRAMENTO", itemId: null, itemName: `Addestramento ${c.breed.name} – ${c.name}${rareTxt}${plate ? ` [${plate}]` : ""}`,
        quantity: 1, unitPrice: price, lineTotal: round2(price), coatId: c.id, breedName: c.breed.name, coatName: c.name, plate, rarity, horseId: h?.id ?? null,
      };
    });
    const itemsList = round2(rows.reduce((t, r) => t + r.lineTotal, 0));

    // Cavallo della stalla venduto nella stessa fattura (facoltativo): prezzo calcolato qui dal listino
    let horseSale: { horse: NonNullable<Awaited<ReturnType<typeof loadHorse>>>; q: ReturnType<typeof quoteHorseSale>; version: number } | null = null;
    const horseRaw = f.str("horse");
    if (horseRaw) {
      if (!can(user.role, "horses.sell")) throw new UserError("Non puoi vendere cavalli.");
      let hIn: z.infer<typeof horseSaleSchema>;
      try {
        hIn = horseSaleSchema.parse(JSON.parse(horseRaw));
      } catch (e) {
        if (e instanceof z.ZodError) throw e;
        throw new UserError("Dati del cavallo non validi.");
      }
      if (horseIds.includes(hIn.horseId)) throw new UserError("L'addestramento del cavallo venduto si sceglie nella sua sezione (“Con addestramento”), non come riga a parte.");
      const horse = await loadHorse(hIn.horseId);
      if (!horse || !canSeeBreed(user.role, horse.breedId)) throw new UserError("Cavallo non trovato.");
      horseSale = { horse, version: hIn.version, q: quoteHorseSale(horse, s, user, { bracket: hIn.bracket, withTraining: hIn.withTraining, manualPrice: hIn.manualPrice }) };
    }
    if (!rows.length && !horseSale) throw new UserError("Aggiungi un cavallo, un addestramento o un oggetto.");
    if (rows.length && !can(user.role, "shop.sell")) throw new UserError("Non puoi vendere oggetti o addestramenti in bottega.");
    const horsePrice = horseSale?.q.horsePrice ?? 0;
    const listTotal = round2(itemsList + horsePrice);

    // Prezzo forfettario: entro lo sconto massimo per chi ha il permesso, oltre solo con "cambiare il prezzo di listino"
    const flat = f.num("flatPrice");
    let total = listTotal;
    if (flat != null && round2(flat) !== listTotal) {
      if (!can(user.role, "shop.flatPrice")) throw new UserError("Non puoi fare un prezzo forfettario.");
      if (!Number.isFinite(flat) || flat < 0 || flat > 10_000_000) throw new UserError("Prezzo forfettario non valido.");
      const discountPct = listTotal > 0 ? ((listTotal - flat) / listTotal) * 100 : 0;
      if (discountPct > s.maxDiscountPercent + 1e-9 && !can(user.role, "sales.overridePrice")) {
        throw new UserError(`Lo sconto massimo è il ${s.maxDiscountPercent}%: il prezzo più basso possibile è $${round2(listTotal * (1 - s.maxDiscountPercent / 100))}.`);
      }
      total = round2(flat);
    }
    const flatUsed = total !== listTotal;
    // lo sconto (o il rincaro) del forfait si divide in proporzione tra cavallo e resto della fattura
    const discount = round2(listTotal - total);
    const horseDisc = horseSale && listTotal > 0 ? round2((discount * horsePrice) / listTotal) : 0;
    const horseFinal = round2(horsePrice - horseDisc);
    const restFinal = round2(total - horseFinal);
    const buyerName = f.opt("buyerName")?.slice(0, 120) ?? null;
    const notes = f.opt("notes")?.slice(0, 2000) ?? null;
    const now = new Date();
    // Prenotazione della bacheca chiusa con questa vendita (facoltativa)
    const reservationId = f.int("reservationId");
    const reservation = reservationId ? await prisma.reservation.findUnique({ where: { id: reservationId } }) : null;
    if (reservationId) {
      if (!reservation) throw new UserError("Prenotazione non trovata.");
      if (!can(user.role, "reservations.edit")) throw new UserError("Non puoi chiudere le prenotazioni.");
      if (reservation.status === "AFFARE_CHIUSO" || reservation.status === "ANNULLATO") throw new UserError("Questa prenotazione è già chiusa.");
    }

    const out = await prisma.$transaction(async (tx) => {
      // l'acquirente finisce nella rubrica clienti (se attivo in Impostazioni)
      const customerId = await linkCustomer(tx, buyerName ?? reservation?.customerName, { autoCreate: s.customersAutoCreate, userId: user.id, missiva: reservation?.missiva });
      if (customerId) await tx.customer.update({ where: { id: customerId }, data: { updatedAt: now } });
      if (horseSale) {
        const locked = await tx.horse.updateMany({
          where: { id: horseSale.horse.id, status: "IN_STALLA", version: horseSale.version },
          data: { status: "VENDUTO", exitedAt: now, exitReason: "Venduto", version: { increment: 1 } },
        });
        if (locked.count !== 1) throw new UserError("Il cavallo è appena stato venduto o modificato da un altro utente. Ricarica la pagina.");
      }
      let itemSaleId: number | null = null;
      if (rows.length) {
        const is = await tx.itemSale.create({
          data: {
            sellerId: user.id, sellerName: user.displayName, buyerName: buyerName ?? reservation?.customerName ?? null, customerId, total: restFinal, listTotal: itemsList, requestId, soldAt: now,
            notes: horseSale ? [`Venduti con il cavallo ${horseSale.q.label}`, notes].filter(Boolean).join(" · ") : notes,
            lines: { create: rows },
          },
        });
        itemSaleId = is.id;
      }
      // cavalli in stalla addestrati con questa fattura: spunta "addestrato" (se nel frattempo qualcuno l'ha già messa, si annulla tutto)
      for (const id of horseIds) {
        const r = await tx.horse.updateMany({ where: { id, status: "IN_STALLA", trained: false }, data: { trained: true, trainedAt: now, trainedById: user.id, version: { increment: 1 } } });
        if (r.count !== 1) throw new UserError("Uno dei cavalli è appena stato addestrato o venduto da un altro utente. Ricarica la pagina.");
      }
      let saleId: number | null = null;
      if (horseSale) {
        const { horse, q } = horseSale;
        const created = await tx.sale.create({
          data: {
            horseId: horse.id, type: "STALLA", breedName: horse.breed.name, coatName: horse.coat.name, sex: horse.sex, plate: horse.plate,
            ageAtSale: round2(q.age), priceBracket: q.priceBracket, listPrice: q.horsePrice, basePrice: q.base, trainingPrice: q.training || null,
            itemsTotal: rows.length ? restFinal : null, itemSaleId,
            discountType: horseDisc > 0 ? "IMPORTO" : null, discountValue: horseDisc > 0 ? horseDisc : null, finalPrice: horseFinal,
            sellerId: user.id, sellerName: user.displayName, buyerName: buyerName ?? reservation?.customerName ?? null, customerId,
            notes: [notes, ...q.notes, reservation ? `Prenotazione #${reservation.id}` : null].filter(Boolean).join(" · ") || null, soldAt: now,
          },
        });
        saleId = created.id;
      }
      if (reservation) {
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "AFFARE_CHIUSO", saleRef: saleId ? `V${saleId}` : itemSaleId ? `B${itemSaleId}` : null, customerId: customerId ?? reservation.customerId, updatedById: user.id },
        });
      }
      const what = [
        horseSale ? `cavallo ${horseSale.q.label}${horseSale.q.training ? " con addestramento" : ""}` : null,
        ...rows.map((r) => (r.kind === "ADDESTRAMENTO" ? r.itemName : `${r.quantity}× ${r.itemName}`)),
      ].filter(Boolean).join(", ");
      await audit(
        user, flatUsed ? "PREZZO_FORFETTARIO" : horseSale ? "VENDITA" : "VENDITA_OGGETTI", horseSale ? "Vendita" : "Bottega", saleId ?? itemSaleId,
        flatUsed ? `Fattura a prezzo forfettario $${total} (listino $${listTotal}): ${what}` : `Fattura per $${total}: ${what}`,
        {
          listino: listTotal, incassato: total,
          ...(horseSale ? { cavallo: { id: horseSale.horse.id, fascia: horseSale.q.bracket, fasciaCalcolata: horseSale.q.computed, base: horseSale.q.base, addestramento: horseSale.q.training, finale: horseFinal } } : {}),
          righe: rows.map((r) => ({ tipo: r.kind, voce: r.itemName, qta: r.quantity, prezzo: r.lineTotal })),
          ...(reservation ? { prenotazioneChiusa: reservation.id } : {}),
        },
        tx,
      );
      return { saleId };
    }, { timeout: 30_000 });
    revalidatePath("/vendite");
    return {
      ok: true,
      message: `Vendita registrata: $${total}${flatUsed ? ` (listino $${listTotal})` : ""}.`,
      ...(out.saleId ? { redirect: "/vendite?evidenzia=" + out.saleId } : {}),
    };
  });
}

const horseSaleSchema = z.object({
  horseId: z.number().int().positive(),
  version: z.number().int().min(0),
  bracket: z.enum(["A", "B", "LIBERO"]),
  withTraining: z.boolean(),
  manualPrice: z.number().min(0, "Prezzo non valido").max(10_000_000).nullable(),
});
const loadHorse = (id: number) => prisma.horse.findUnique({ where: { id }, include: { coat: true, breed: true } });

export async function voidItemSale(form: FormData) {
  return run(async () => {
    const user = await assertPermission("sales.correct");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const reason = z.string().trim().min(3, "Indica il motivo").max(255).parse(f.str("reason"));
    const untrained = await prisma.$transaction(async (tx) => {
      const r = await tx.itemSale.updateMany({ where: { id, voided: false }, data: { voided: true, voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      if (r.count !== 1) throw new UserError("Vendita già annullata o inesistente.");
      // gli addestramenti annullati tolgono la spunta "addestrato" ai cavalli ancora in stalla
      const lines = await tx.itemSaleLine.findMany({ where: { saleId: id, horseId: { not: null } }, select: { horseId: true } });
      let n = 0;
      for (const l of lines) {
        n += (await tx.horse.updateMany({ where: { id: l.horseId!, status: "IN_STALLA", trained: true }, data: { trained: false, trainedAt: null, trainedById: null, version: { increment: 1 } } })).count;
      }
      await audit(user, "ANNULLA_VENDITA_OGGETTI", "Bottega", id, `Annullata fattura bottega #${id}: ${reason}${n ? ` (${n} cavalli tornano “non addestrati”)` : ""}`, undefined, tx);
      return n;
    });
    if (untrained) return { ok: true, message: `Vendita annullata. ${untrained === 1 ? "Il cavallo torna" : `${untrained} cavalli tornano`} “non addestrato”.` };
    return { ok: true, message: "Vendita annullata (resta nello storico)." };
  });
}

// ───────── Proposte / note degli utenti ─────────
export async function createShopNote(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.view");
    const f = fd(form);
    const data = z
      .object({ type: z.enum(["NUOVO_FORNITORE", "MODIFICA_PROPOSTA", "NOTA"]), text: z.string().trim().min(3, "Scrivi la proposta").max(2000) })
      .parse({ type: f.str("type"), text: f.str("text") });
    const n = await prisma.shopNote.create({ data: { ...data, createdById: user.id } });
    await audit(user, "PROPOSTA_BOTTEGA", "Bottega", n.id, `Nuova proposta (${data.type})`);
    return { ok: true, message: "Proposta inviata alla direzione." };
  });
}

export async function handleShopNote(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const status = z.enum(["APERTA", "ACCOLTA", "RESPINTA"]).parse(f.str("status"));
    await prisma.shopNote.update({ where: { id }, data: { status, response: f.opt("response"), handledById: user.id, handledAt: new Date() } });
    await audit(user, "GESTIONE_PROPOSTA", "Bottega", id, `Proposta #${id} → ${status}`);
    return { ok: true, message: "Proposta aggiornata." };
  });
}

export async function deleteShopNote(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const id = fd(form).int("id") ?? 0;
    const n = await prisma.shopNote.findUnique({ where: { id } });
    if (!n) throw new UserError("Proposta non trovata.");
    await prisma.shopNote.delete({ where: { id } });
    await audit(user, "ELIMINA_PROPOSTA", "Bottega", id, `Eliminata proposta #${id}`, n);
    return { ok: true, message: "Proposta eliminata." };
  });
}

// ───────── Rimborsi ─────────
export async function createReimbursement(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.view");
    const f = fd(form);
    const data = z
      .object({
        supplierId: z.number().int().positive().nullable(),
        supplierName: z.string().max(120).nullable(),
        description: z.string().trim().min(3, "Descrivi la merce acquistata").max(1000),
        amount: z.number({ message: "Inserisci l'importo" }).positive("L'importo deve essere maggiore di zero"),
      })
      .refine((d) => d.supplierId || d.supplierName, { message: "Indica il fornitore" })
      .parse({ supplierId: f.int("supplierId"), supplierName: f.opt("supplierName"), description: f.str("description"), amount: f.num("amount") });
    const r = await prisma.reimbursement.create({ data: { ...data, userId: user.id } });
    await audit(user, "RICHIESTA_RIMBORSO", "Bottega", r.id, `Richiesta rimborso $${data.amount}`);
    return { ok: true, message: "Richiesta di rimborso inviata." };
  });
}

export async function handleReimbursement(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.manage");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const status = z.enum(["RICHIESTO", "APPROVATO", "PAGATO", "RESPINTO"]).parse(f.str("status"));
    const r = await prisma.reimbursement.findUnique({ where: { id }, include: { user: true } });
    if (!r) throw new UserError("Richiesta non trovata.");
    await prisma.reimbursement.update({
      where: { id },
      data: { status, response: f.opt("response") ?? r.response, handledById: user.id, handledAt: new Date(), paidAt: status === "PAGATO" ? new Date() : r.paidAt },
    });
    await audit(user, "GESTIONE_RIMBORSO", "Bottega", id, `Rimborso #${id} di ${r.user.displayName} ($${Number(r.amount)}) → ${status}`);
    return { ok: true, message: status === "PAGATO" ? "Rimborso segnato come pagato." : "Richiesta aggiornata." };
  });
}

