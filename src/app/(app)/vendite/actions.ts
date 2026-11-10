"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { fromZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/format";

/** Correzione di una vendita (solo admin). */
export async function correctSale(form: FormData) {
  return run(async () => {
    const user = await assertPermission("sales.correct");
    const f = fd(form);
    const id = f.int("saleId") ?? 0;
    const data = z
      .object({
        finalPrice: z.number({ message: "Prezzo non valido" }).min(0),
        sellerId: z.number().int().positive(),
        buyerName: z.string().max(120).nullable(),
        notes: z.string().max(2000).nullable(),
        soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Data non valida"),
      })
      .parse({ finalPrice: f.num("finalPrice"), sellerId: f.int("sellerId"), buyerName: f.opt("buyerName"), notes: f.opt("notes"), soldAt: f.str("soldAt") });
    const before = await prisma.sale.findUnique({ where: { id } });
    if (!before) throw new UserError("Vendita non trovata.");
    const seller = await prisma.user.findUnique({ where: { id: data.sellerId } });
    if (!seller) throw new UserError("Venditore non trovato.");
    const soldAt = fromZonedTime(data.soldAt + ":00", TZ);
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id },
        data: { finalPrice: data.finalPrice, sellerId: seller.id, sellerName: seller.displayName, buyerName: data.buyerName, notes: data.notes, soldAt },
      });
      await audit(user, "CORREZIONE_VENDITA", "Vendita", id, `Corretta vendita #${id}`, {
        prima: { prezzo: Number(before.finalPrice), venditore: before.sellerName, data: before.soldAt, acquirente: before.buyerName, note: before.notes },
        dopo: { prezzo: data.finalPrice, venditore: seller.displayName, data: soldAt, acquirente: data.buyerName, note: data.notes },
      }, tx);
    });
    return { ok: true, message: "Vendita corretta." };
  });
}

/** Annullamento (mai cancellazione). Se la vendita era dalla stalla, il cavallo torna disponibile. */
export async function voidSale(form: FormData) {
  return run(async () => {
    const user = await assertPermission("sales.correct");
    const f = fd(form);
    const id = f.int("saleId") ?? 0;
    const reason = z.string().trim().min(3, "Indica il motivo dell'annullamento").max(255).parse(f.str("reason"));
    const back = f.bool("backToStable");
    await prisma.$transaction(async (tx) => {
      const r = await tx.sale.updateMany({ where: { id, voided: false }, data: { voided: true, voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      if (r.count !== 1) throw new UserError("Vendita già annullata o inesistente.");
      const sale = await tx.sale.findUniqueOrThrow({ where: { id } });
      if (back && sale.type === "STALLA") {
        await tx.horse.updateMany({
          where: { id: sale.horseId, status: "VENDUTO" },
          data: { status: "IN_STALLA", exitedAt: null, exitReason: null, version: { increment: 1 } },
        });
      }
      await audit(user, "ANNULLA_VENDITA", "Vendita", id, `Annullata vendita #${id}: ${reason}`, { cavalloInStalla: back && sale.type === "STALLA" }, tx);
    });
    return { ok: true, message: "Vendita annullata (resta nello storico)." };
  });
}
