"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { TZ } from "@/lib/format";
import { parseWeekKey, weekLabel } from "@/lib/weeks";
import { liveWeek, payrollOverview } from "@/lib/payroll";
import type { Prisma } from "@prisma/client";

async function payOne(
  tx: Prisma.TransactionClient,
  actor: { id: number; username: string },
  userId: number,
  weekStart: Date,
  amountOverride: number | null,
  notes: string | null,
) {
  const live = await liveWeek(userId, weekStart);
  const existing = await tx.payrollEntry.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
  if (existing?.status === "PAGATO") throw new UserError(`La settimana ${weekLabel(weekStart, TZ)} risulta già pagata.`);
  const override = amountOverride ?? (existing?.amountOverride != null ? Number(existing.amountOverride) : null);
  const amount = override ?? live.computed;
  const data = {
    status: "PAGATO" as const,
    salesCount: live.count,
    salesTotal: live.total,
    percent: live.percent,
    computedAmount: live.computed,
    amountOverride: override,
    paidAmount: amount,
    paidAt: new Date(),
    paidById: actor.id,
    notes: notes ?? existing?.notes ?? null,
  };
  const entry = existing
    ? await tx.payrollEntry.update({ where: { id: existing.id }, data })
    : await tx.payrollEntry.create({ data: { userId, weekStart, ...data } });
  await tx.payment.create({
    data: { payrollEntryId: entry.id, userId, weekStart, amount, action: "PAGATO", recordedById: actor.id, notes },
  });
  return { entry, amount };
}

export async function payWeek(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const weekStart = parseWeekKey(f.str("week"), TZ);
    if (!weekStart) throw new UserError("Settimana non valida.");
    const amount = f.num("amount");
    if (amount != null && (Number.isNaN(amount) || amount < 0)) throw new UserError("Importo non valido.");
    const notes = f.opt("notes");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserError("Dipendente non trovato.");
    const r = await prisma.$transaction(async (tx) => {
      const r = await payOne(tx, actor, userId, weekStart, amount, notes);
      await audit(actor, "STIPENDIO_PAGATO", "Stipendio", r.entry.id, `Pagato stipendio a ${user.displayName} (${weekLabel(weekStart, TZ)}): $${r.amount}`, undefined, tx);
      return r;
    });
    return { ok: true, message: `Stipendio registrato come PAGATO: $${r.amount}.` };
  });
}

/** Paga in un'unica operazione tutte le settimane arretrate di un dipendente. */
export async function payArrears(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const notes = f.opt("notes");
    const [ov] = await payrollOverview({ userId, includeInactive: true });
    if (!ov || ov.arrears.length === 0) throw new UserError("Nessuna settimana arretrata da pagare.");
    const total = await prisma.$transaction(async (tx) => {
      let total = 0;
      for (const w of ov.arrears) {
        const r = await payOne(tx, actor, userId, w.weekStart, null, notes);
        total += r.amount;
      }
      await audit(actor, "STIPENDIO_PAGATO", "Stipendio", userId, `Pagate ${ov.arrears.length} settimane arretrate a ${ov.name}: $${total}`, { settimane: ov.arrears.map((w) => w.key) }, tx);
      return total;
    }, { timeout: 30_000 });
    return { ok: true, message: `Pagate ${ov.arrears.length} settimane: totale $${Math.round(total * 100) / 100}.` };
  });
}

export async function unpayWeek(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const entryId = f.int("entryId") ?? 0;
    const notes = z.string().trim().min(3, "Indica il motivo").max(500).parse(f.str("notes"));
    await prisma.$transaction(async (tx) => {
      const e = await tx.payrollEntry.findUnique({ where: { id: entryId }, include: { user: true } });
      if (!e || e.status !== "PAGATO") throw new UserError("La settimana non risulta pagata.");
      await tx.payrollEntry.update({
        where: { id: entryId },
        data: { status: "DA_PAGARE", paidAt: null, paidById: null, paidAmount: null, salesCount: null, salesTotal: null, computedAmount: null, percent: null },
      });
      await tx.payment.create({
        data: { payrollEntryId: e.id, userId: e.userId, weekStart: e.weekStart, amount: e.paidAmount ?? 0, action: "ANNULLATO", recordedById: actor.id, notes },
      });
      await audit(actor, "STIPENDIO_NON_PAGATO", "Stipendio", e.id, `Stipendio di ${e.user.displayName} (${weekLabel(e.weekStart, TZ)}) segnato come NON PAGATO: ${notes}`, undefined, tx);
    });
    return { ok: true, message: "Settimana riportata a NON PAGATO (il pagamento resta nello storico)." };
  });
}

/** Modifica importo/note di una settimana non ancora pagata (o solo note se pagata). */
export async function editWeek(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const weekStart = parseWeekKey(f.str("week"), TZ);
    if (!weekStart) throw new UserError("Settimana non valida.");
    const amount = f.num("amount");
    if (amount != null && (Number.isNaN(amount) || amount < 0)) throw new UserError("Importo non valido.");
    const notes = f.opt("notes");
    await prisma.$transaction(async (tx) => {
      const existing = await tx.payrollEntry.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
      if (existing?.status === "PAGATO") {
        await tx.payrollEntry.update({ where: { id: existing.id }, data: { notes } });
      } else if (existing) {
        await tx.payrollEntry.update({ where: { id: existing.id }, data: { amountOverride: amount, notes } });
      } else {
        await tx.payrollEntry.create({ data: { userId, weekStart, amountOverride: amount, notes } });
      }
      await audit(actor, "STIPENDIO_MODIFICATO", "Stipendio", existing?.id ?? null, `Modificata settimana ${weekLabel(weekStart, TZ)} (utente #${userId})`, {
        prima: { importo: existing?.amountOverride != null ? Number(existing.amountOverride) : null, note: existing?.notes },
        dopo: { importo: existing?.status === "PAGATO" ? "invariato (già pagato)" : amount, note: notes },
      }, tx);
    });
    return { ok: true, message: "Registrazione aggiornata." };
  });
}

/** Percentuale stipendio personalizzata (vuoto = usa quella globale). */
export async function setUserPercent(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const pct = f.num("percent");
    if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) throw new UserError("La percentuale deve essere tra 0 e 100.");
    const before = await prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new UserError("Dipendente non trovato.");
    await prisma.user.update({ where: { id: userId }, data: { salaryPercent: pct } });
    await audit(actor, "PERCENTUALE_STIPENDIO", "Utente", userId, `Percentuale stipendio di ${before.displayName}: ${pct == null ? "globale" : pct + "%"}`, {
      prima: before.salaryPercent == null ? null : Number(before.salaryPercent),
      dopo: pct,
    });
    return { ok: true, message: "Percentuale aggiornata. Vale per le settimane non ancora pagate." };
  });
}
