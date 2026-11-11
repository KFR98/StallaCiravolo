"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/pricing";

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

// ───────── Vendita oggetti ─────────
const lineSchema = z.array(z.object({ itemId: z.number().int().positive(), quantity: z.number().int().min(1).max(10000) })).min(1, "Aggiungi almeno un oggetto");

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
    const items = await prisma.shopItem.findMany({ where: { id: { in: lines.map((l) => l.itemId) }, kind: "VENDITA", archived: false } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const rows = lines.map((l) => {
      const it = byId.get(l.itemId);
      if (!it) throw new UserError("Un oggetto del carrello non è più in vendita.");
      if (it.price == null) throw new UserError(`"${it.name}" non ha un prezzo: avvisa la direzione.`);
      const unit = Number(it.price);
      return { itemId: it.id, itemName: it.name, quantity: l.quantity, unitPrice: unit, lineTotal: round2(unit * l.quantity) };
    });
    const total = round2(rows.reduce((t, r) => t + r.lineTotal, 0));
    const sale = await prisma.$transaction(async (tx) => {
      const sale = await tx.itemSale.create({
        data: { sellerId: user.id, sellerName: user.displayName, buyerName: f.opt("buyerName"), notes: f.opt("notes"), total, requestId, lines: { create: rows } },
      });
      await audit(user, "VENDITA_OGGETTI", "Bottega", sale.id, `Vendita oggetti per $${total}: ${rows.map((r) => `${r.quantity}× ${r.itemName}`).join(", ")}`, undefined, tx);
      return sale;
    });
    return { ok: true, message: `Vendita registrata: $${Number(sale.total)}.` };
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

