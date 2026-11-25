"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/pricing";
import { cashBalance } from "@/lib/cash";
import { closureSummary } from "@/lib/cash-closure";
import { can } from "@/lib/permissions";

const reasonSchema = z.string().trim().min(3, "Scrivi il motivo (almeno 3 caratteri)").max(200, "Motivo troppo lungo");
const amountSchema = z.number({ message: "Indica l'importo" }).positive("L'importo deve essere maggiore di zero").max(100_000_000, "Importo troppo alto");

/**
 * Prelievo, versamento o allineamento al contante reale.
 * Il saldo si ricalcola dentro la transazione: due prelievi insieme non possono andare sotto zero.
 */
export async function cashMove(form: FormData) {
  return run(async () => {
    const user = await assertPermission("cash.manage");
    const f = fd(form);
    const kind = z.enum(["PRELIEVO", "VERSAMENTO", "RETTIFICA"], { message: "Operazione non valida" }).parse(f.str("kind"));
    const requestId = z.string().min(8).max(64).parse(f.str("requestId"));
    const reason = reasonSchema.parse(f.str("reason"));
    const all = f.bool("all");

    if (await prisma.cashMovement.findUnique({ where: { requestId } })) return { ok: true, message: "Operazione già registrata." };

    const res = await prisma.$transaction(async (tx) => {
      const balance = await cashBalance(tx);
      let amount: number;
      if (kind === "PRELIEVO") {
        const want = all ? balance : round2(amountSchema.parse(f.num("amount")));
        if (want <= 0) throw new UserError("In cassa non c'è niente da prelevare.");
        if (want > balance + 1e-9) throw new UserError(`In cassa ci sono solo $${balance}: non puoi prelevare $${want}.`);
        amount = -want;
      } else if (kind === "VERSAMENTO") {
        amount = round2(amountSchema.parse(f.num("amount")));
      } else {
        // l'importo indicato è il contante che c'è DAVVERO: si registra la differenza
        const real = z.number({ message: "Indica quanto contante c'è davvero" }).min(0, "Il contante non può essere negativo").max(100_000_000).parse(f.num("amount"));
        amount = round2(real - balance);
        if (Math.abs(amount) < 0.005) throw new UserError("La cassa è già allineata: nessuna differenza da registrare.");
      }
      const m = await tx.cashMovement.create({ data: { kind, amount, reason, userId: user.id, userName: user.displayName, requestId } });
      const after = round2(balance + amount);
      await audit(
        user, kind === "PRELIEVO" ? "PRELIEVO_CASSA" : kind === "VERSAMENTO" ? "VERSAMENTO_CASSA" : "RETTIFICA_CASSA", "Cassa", m.id,
        kind === "PRELIEVO" ? `Prelevati $${-amount} dalla cassa: ${reason}` : kind === "VERSAMENTO" ? `Versati $${amount} in cassa: ${reason}` : `Cassa allineata (${amount < 0 ? "−" : "+"}$${Math.abs(amount)}): ${reason}`,
        { prima: { saldo: balance }, dopo: { saldo: after } },
        tx,
      );
      return { amount, after };
    });
    revalidatePath("/cassa");
    const signed = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(v)}`;
    const msg = kind === "PRELIEVO" ? `Prelevati $${-res.amount}.` : kind === "VERSAMENTO" ? `Versati $${res.amount}.` : `Cassa allineata (${signed(res.amount)}).`;
    return { ok: true, message: `${msg} In cassa ora: $${res.after}.` };
  });
}

/** Annulla un movimento manuale (resta nello storico, barrato). */
export async function voidCashMove(form: FormData) {
  return run(async () => {
    const user = await assertPermission("cash.manage");
    const f = fd(form);
    const id = z.number().int().positive().parse(f.int("id"));
    const reason = reasonSchema.parse(f.str("reason"));
    await prisma.$transaction(async (tx) => {
      const m = await tx.cashMovement.findUnique({ where: { id } });
      if (!m || m.voided) throw new UserError("Movimento già annullato o inesistente.");
      // annullare un versamento toglie soldi: non si può andare sotto zero
      if (Number(m.amount) > 0) {
        const bal = await cashBalance(tx);
        if (bal - Number(m.amount) < -1e-9) throw new UserError(`Annullandolo la cassa andrebbe sotto zero (ora ci sono $${bal}).`);
      }
      await tx.cashMovement.update({ where: { id }, data: { voided: true, voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      await audit(user, "ANNULLA_MOVIMENTO_CASSA", "Cassa", id, `Annullato ${m.kind.toLowerCase()} di $${Math.abs(Number(m.amount))}: ${reason}`, { movimento: { tipo: m.kind, importo: Number(m.amount), motivo: m.reason, di: m.userName } }, tx);
    });
    revalidatePath("/cassa");
    return { ok: true, message: "Movimento annullato." };
  });
}

/**
 * Chiusura di cassa: fotografa il periodo dall'ultima chiusura (entrate e uscite per tipo e per stalliere).
 * Se si indica il contante contato, si registra la differenza (ammanco o eccedenza) e, se scelto, si allinea la cassa.
 */
export async function closeCash(form: FormData) {
  return run(async () => {
    const user = await assertPermission("cash.close");
    const f = fd(form);
    const countedRaw = f.num("counted");
    const counted = countedRaw == null ? null : z.number({ message: "Contante non valido" }).min(0, "Il contante non può essere negativo").max(100_000_000).parse(countedRaw);
    const align = f.bool("align");
    const notes = z.string().trim().max(1000).nullable().parse(f.opt("notes"));
    const res = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const sum = await closureSummary(tx, now);
      const difference = counted == null ? null : round2(counted - sum.closingBalance);
      if (align && difference && Math.abs(difference) >= 0.005) {
        if (!can(user.role, "cash.manage")) throw new UserError("Per allineare la cassa serve anche il permesso di prelevare e versare.");
        await tx.cashMovement.create({
          data: { kind: "RETTIFICA", amount: difference, reason: `Chiusura di cassa: ${difference > 0 ? "eccedenza" : "ammanco"}`, userId: user.id, userName: user.displayName, createdAt: new Date(now.getTime() - 1) },
        });
      }
      const c = await tx.cashClosure.create({
        data: {
          periodFrom: sum.from ? new Date(sum.from) : null, periodTo: now, expected: sum.closingBalance, counted, difference,
          summary: JSON.stringify(sum), notes, userId: user.id, userName: user.displayName,
        },
      });
      const diffTxt = difference == null ? "" : `, contati $${counted} (${difference >= 0 ? "+" : "−"}$${Math.abs(difference)})`;
      await audit(user, "CHIUSURA_CASSA", "Cassa", c.id,
        `Chiusura di cassa: saldo $${sum.closingBalance}${diffTxt}${align && difference ? ", cassa allineata" : ""}`,
        { entrate: sum.income, uscite: sum.outgo, movimenti: sum.movements }, tx);
      return { id: c.id, difference };
    });
    revalidatePath("/cassa");
    const d = res.difference;
    return {
      ok: true,
      message: d == null ? "Chiusura registrata." : Math.abs(d) < 0.005 ? "Chiusura registrata: la cassa torna al centesimo." : `Chiusura registrata con ${d > 0 ? "un'eccedenza" : "un ammanco"} di $${Math.abs(d)}.`,
      redirect: `/cassa/chiusure/${res.id}`,
    };
  });
}
