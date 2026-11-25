import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { cashLedger, CASH_KIND_LABEL, type CashKind } from "./cash";
import { round2 } from "./pricing";

/** Riepilogo del periodo dall'ultima chiusura (o dall'inizio) a adesso. */
export type ClosureSummary = {
  from: string | null;
  to: string;
  openingBalance: number;
  closingBalance: number;
  income: number;
  outgo: number;
  byKind: { kind: CashKind; label: string; total: number; count: number }[];
  bySeller: { name: string; total: number; count: number }[];
  movements: number;
};

export async function closureSummary(tx: Prisma.TransactionClient = prisma, now = new Date()): Promise<ClosureSummary> {
  const last = await tx.cashClosure.findFirst({ orderBy: { periodTo: "desc" }, select: { periodTo: true } });
  const from = last?.periodTo ?? null;
  const ledger = (await cashLedger(tx)).filter((e) => e.at <= now);
  const before = from ? ledger.filter((e) => e.at <= from) : [];
  const inRange = ledger.filter((e) => (!from || e.at > from) && !e.voided);
  const openingBalance = before.length ? before[before.length - 1].balanceAfter : 0;
  const closingBalance = ledger.length ? ledger[ledger.length - 1].balanceAfter : 0;
  const kinds = new Map<CashKind, { total: number; count: number }>();
  const sellers = new Map<string, { total: number; count: number }>();
  let income = 0, outgo = 0;
  for (const e of inRange) {
    const k = kinds.get(e.kind) ?? { total: 0, count: 0 };
    k.total = round2(k.total + e.amount); k.count++;
    kinds.set(e.kind, k);
    if (e.amount > 0) income = round2(income + e.amount); else outgo = round2(outgo + e.amount);
    if ((e.kind === "VENDITA" || e.kind === "BOTTEGA" || e.kind === "BLIP") && e.who) {
      const s = sellers.get(e.who) ?? { total: 0, count: 0 };
      s.total = round2(s.total + e.amount); s.count++;
      sellers.set(e.who, s);
    }
  }
  return {
    from: from?.toISOString() ?? null, to: now.toISOString(), openingBalance, closingBalance, income, outgo,
    byKind: [...kinds].map(([kind, v]) => ({ kind, label: CASH_KIND_LABEL[kind], ...v })).sort((a, b) => b.total - a.total),
    bySeller: [...sellers].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
    movements: inRange.length,
  };
}
