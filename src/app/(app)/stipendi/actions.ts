"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { TZ } from "@/lib/format";
import { parseWeekKey, weekLabel } from "@/lib/weeks";
import { payrollOverview, type PayrollWeek } from "@/lib/payroll";
import { round2 } from "@/lib/pricing";

type Actor = { id: number; username: string };

/** Registra un pagamento su una settimana (fotografando i totali al primo pagamento). */
async function payOnWeek(tx: Prisma.TransactionClient, actor: Actor, userId: number, w: PayrollWeek, amount: number, notes: string | null) {
  const existing = await tx.payrollEntry.findUnique({ where: { userId_weekStart: { userId, weekStart: w.weekStart } } });
  const paid = round2(Number(existing?.paidAmount ?? 0) + amount);
  const snap = {
    stableTotal: w.totals.stable, govTotal: w.totals.gov, itemsTotal: w.totals.items,
    pctStable: w.percents.stable, pctGov: w.percents.gov, pctItems: w.percents.items, computedAmount: w.computed,
  };
  const status = paid + 0.004 >= w.due ? "PAGATO" : "PARZIALE";
  const data = { ...(Number(existing?.paidAmount ?? 0) > 0 ? {} : snap), paidAmount: paid, status, paidAt: new Date(), paidById: actor.id, ...(notes ? { notes } : {}) } as const;
  const entry = existing
    ? await tx.payrollEntry.update({ where: { id: existing.id }, data })
    : await tx.payrollEntry.create({ data: { userId, weekStart: w.weekStart, ...snap, ...data } });
  await tx.payment.create({
    data: { payrollEntryId: entry.id, userId, weekStart: w.weekStart, dueAmount: w.residual, amount, action: "PAGATO", recordedById: actor.id, notes },
  });
  return entry;
}

/**
 * "Paga" dalla lista utenti: l'importo viene distribuito sulle settimane arretrate dalla più vecchia.
 * Se è inferiore al dovuto resta un residuo; se è superiore la differenza è registrata come extra
 * sull'ultima settimana.
 */
export async function payUser(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const amount = z.number({ message: "Inserisci l'importo" }).positive("L'importo deve essere maggiore di zero").parse(f.num("amount"));
    const notes = f.opt("notes");
    const [ov] = await payrollOverview({ userId });
    if (!ov) throw new UserError("Dipendente non trovato.");
    let targets = ov.arrears;
    if (!targets.length) {
      const lastClosed = ov.weeks.find((w) => !w.inProgress) ?? ov.current;
      if (!lastClosed) throw new UserError("Nessuna settimana a cui assegnare il pagamento.");
      targets = [lastClosed];
    }
    const dueTotal = round2(targets.reduce((t, w) => t + w.residual, 0));
    await prisma.$transaction(async (tx) => {
      let left = round2(amount);
      for (let i = 0; i < targets.length && left > 0; i++) {
        const w = targets[i];
        const isLast = i === targets.length - 1;
        const part = isLast ? left : Math.min(left, w.residual);
        if (part <= 0) continue;
        await payOnWeek(tx, actor, userId, w, round2(part), notes);
        left = round2(left - part);
      }
      await audit(actor, "STIPENDIO_PAGATO", "Stipendio", userId, `Pagati $${amount} a ${ov.name} (dovuti $${dueTotal})`, { settimane: targets.map((t) => t.key), dovuto: dueTotal, pagato: amount }, tx);
    }, { timeout: 30_000 });
    const diff = round2(amount - dueTotal);
    const inCorso = targets.length === 1 && targets[0].inProgress ? " (settimana in corso)" : "";
    return {
      ok: true,
      message: diff > 0.004 ? `Pagati $${amount} a ${ov.name}${inCorso}: +$${diff} in più del dovuto.` : diff < -0.004 ? `Pagati $${amount} a ${ov.name}${inCorso}: restano $${-diff} da saldare.` : `Pagati $${amount} a ${ov.name}${inCorso}: saldato.`,
    };
  });
}

/** Pagamento di una singola settimana (importo libero). */
export async function payWeek(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const weekStart = parseWeekKey(f.str("week"), TZ);
    if (!weekStart) throw new UserError("Settimana non valida.");
    const amount = z.number({ message: "Inserisci l'importo" }).positive("L'importo deve essere maggiore di zero").parse(f.num("amount"));
    const notes = f.opt("notes");
    const [ov] = await payrollOverview({ userId });
    const w = ov?.weeks.find((x) => x.weekStart.getTime() === weekStart.getTime());
    if (!ov || !w) throw new UserError("Settimana non trovata.");
    await prisma.$transaction(async (tx) => {
      const e = await payOnWeek(tx, actor, userId, w, round2(amount), notes);
      await audit(actor, "STIPENDIO_PAGATO", "Stipendio", e.id, `Pagati $${amount} a ${ov.name} per ${weekLabel(weekStart, TZ)} (dovuti $${w.residual})`, undefined, tx);
    });
    return { ok: true, message: `Registrato pagamento di $${amount}.` };
  });
}

/** Annulla i pagamenti di una settimana (restano nello storico come annullati). */
export async function unpayWeek(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const entryId = f.int("entryId") ?? 0;
    const notes = z.string().trim().min(3, "Indica il motivo").max(500).parse(f.str("notes"));
    await prisma.$transaction(async (tx) => {
      const e = await tx.payrollEntry.findUnique({ where: { id: entryId }, include: { user: true } });
      if (!e || Number(e.paidAmount) <= 0) throw new UserError("La settimana non risulta pagata.");
      await tx.payrollEntry.update({
        where: { id: entryId },
        data: { status: "DA_PAGARE", paidAmount: 0, paidAt: null, paidById: null, stableTotal: null, govTotal: null, itemsTotal: null, pctStable: null, pctGov: null, pctItems: null, computedAmount: null },
      });
      await tx.payment.create({
        data: { payrollEntryId: e.id, userId: e.userId, weekStart: e.weekStart, dueAmount: 0, amount: e.paidAmount, action: "ANNULLATO", recordedById: actor.id, notes },
      });
      await audit(actor, "STIPENDIO_NON_PAGATO", "Stipendio", e.id, `Pagamento di ${e.user.displayName} (${weekLabel(e.weekStart, TZ)}) annullato: ${notes}`, undefined, tx);
    });
    return { ok: true, message: "Pagamento annullato (resta nello storico)." };
  });
}

/** Modifica il dovuto e le note di una settimana. */
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
      if (existing) await tx.payrollEntry.update({ where: { id: existing.id }, data: { amountOverride: amount, notes } });
      else await tx.payrollEntry.create({ data: { userId, weekStart, amountOverride: amount, notes } });
      await audit(actor, "STIPENDIO_MODIFICATO", "Stipendio", existing?.id ?? null, `Modificata settimana ${weekLabel(weekStart, TZ)} (utente #${userId})`, {
        prima: { dovuto: existing?.amountOverride != null ? Number(existing.amountOverride) : "calcolato", note: existing?.notes },
        dopo: { dovuto: amount ?? "calcolato", note: notes },
      }, tx);
    });
    return { ok: true, message: "Registrazione aggiornata." };
  });
}

/** Percentuali personali (vuoto = globali). */
export async function setUserPercents(form: FormData) {
  return run(async () => {
    const actor = await assertPermission("payroll.manage");
    const f = fd(form);
    const userId = f.int("userId") ?? 0;
    const read = (k: string) => {
      const v = f.num(k);
      if (v != null && (Number.isNaN(v) || v < 0 || v > 100)) throw new UserError("Le percentuali devono essere tra 0 e 100.");
      return v;
    };
    const data = { pctStable: read("pctStable"), pctGov: read("pctGov"), pctItems: read("pctItems") };
    const before = await prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new UserError("Dipendente non trovato.");
    await prisma.user.update({ where: { id: userId }, data });
    await audit(actor, "PERCENTUALI_STIPENDIO", "Utente", userId, `Percentuali stipendio di ${before.displayName} aggiornate`, {
      prima: { stalla: before.pctStable?.toString() ?? "globale", blip: before.pctGov?.toString() ?? "globale", oggetti: before.pctItems?.toString() ?? "globale" },
      dopo: { stalla: data.pctStable ?? "globale", blip: data.pctGov ?? "globale", oggetti: data.pctItems ?? "globale" },
    });
    return { ok: true, message: "Percentuali aggiornate. Valgono per le settimane non ancora pagate." };
  });
}
