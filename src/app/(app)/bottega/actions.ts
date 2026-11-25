"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { can, canSeeBreed } from "@/lib/permissions";

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
        price: z.number().min(0, "Prezzo non valido").nullable(),
        priceNote: z.string().max(200).nullable(),
        notes: z.string().max(1000).nullable(),
      })
      .parse({ kind: f.str("kind"), name: f.str("name"), group: f.opt("group"), price: f.num("price"), priceNote: f.opt("priceNote"), notes: f.opt("notes") });
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
        rarity: z.enum(["RARO", "LEGGENDARIO"]).nullable(),
        plate: z.string().trim().max(40).nullable(),
      }),
    ]),
  )
  .min(1, "Aggiungi almeno un oggetto o un addestramento")
  .max(200, "Troppe righe in una fattura");

export async function sellItems(form: FormData) {
  return run(async () => {
    const user = await assertPermission("shop.sell");
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
    const itemIds: number[] = [];
    const coatIds: number[] = [];
    for (const l of lines) {
      if (l.type === "item") itemIds.push(l.itemId);
      else coatIds.push(l.coatId);
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
      const c = coatById.get(l.coatId);
      if (!c || c.breed.archived || !canSeeBreed(user.role, c.breedId)) throw new UserError("Uno dei cavalli scelti non è più nel catalogo.");
      const price = l.rarity ? s.rareTrainingPrice : c.trainingPrice == null ? null : Number(c.trainingPrice);
      if (price == null) throw new UserError(`Per ${c.breed.name} – ${c.name} non c'è un prezzo di addestramento nel listino: avvisa la direzione.`);
      const rareTxt = l.rarity === "RARO" ? " (raro)" : l.rarity === "LEGGENDARIO" ? " (leggendario)" : "";
      return {
        kind: "ADDESTRAMENTO", itemId: null, itemName: `Addestramento ${c.breed.name} – ${c.name}${rareTxt}${l.plate ? ` [${l.plate}]` : ""}`,
        quantity: 1, unitPrice: price, lineTotal: round2(price), coatId: c.id, breedName: c.breed.name, coatName: c.name, plate: l.plate || null, rarity: l.rarity,
      };
    });
    const listTotal = round2(rows.reduce((t, r) => t + r.lineTotal, 0));

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

    const sale = await prisma.$transaction(async (tx) => {
      const sale = await tx.itemSale.create({
        data: { sellerId: user.id, sellerName: user.displayName, buyerName: f.opt("buyerName"), notes: f.opt("notes"), total, listTotal, requestId, lines: { create: rows } },
      });
      const what = rows.map((r) => (r.kind === "ADDESTRAMENTO" ? r.itemName : `${r.quantity}× ${r.itemName}`)).join(", ");
      await audit(
        user, flatUsed ? "PREZZO_FORFETTARIO" : "VENDITA_OGGETTI", "Bottega", sale.id,
        flatUsed ? `Fattura a prezzo forfettario $${total} (listino $${listTotal}): ${what}` : `Fattura bottega per $${total}: ${what}`,
        { listino: listTotal, incassato: total, righe: rows.map((r) => ({ tipo: r.kind, voce: r.itemName, qta: r.quantity, prezzo: r.lineTotal })) },
        tx,
      );
      return sale;
    });
    return { ok: true, message: `Vendita registrata: $${Number(sale.total)}${flatUsed ? ` (listino $${listTotal})` : ""}.` };
  });
}

export async function voidItemSale(form: FormData) {
  return run(async () => {
    const user = await assertPermission("sales.correct");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const reason = z.string().trim().min(3, "Indica il motivo").max(255).parse(f.str("reason"));
    const r = await prisma.itemSale.updateMany({ where: { id, voided: false }, data: { voided: true, voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
    if (r.count !== 1) throw new UserError("Vendita già annullata o inesistente.");
    await audit(user, "ANNULLA_VENDITA_OGGETTI", "Bottega", id, `Annullata vendita oggetti #${id}: ${reason}`);
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

