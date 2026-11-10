import type { PayrollEntry, Role } from "@prisma/client";
import { prisma } from "./db";
import { getSettings, type Settings } from "./settings";
import { TZ } from "./format";
import { weekStartOf, addWeeks, isoWeekKey } from "./weeks";
import { round2 } from "./pricing";

export async function userSalaryPercent(userId: number, s?: Settings) {
  const settings = s ?? (await getSettings());
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { salaryPercent: true } });
  return u?.salaryPercent != null ? Number(u.salaryPercent) : settings.salaryPercent;
}

export type PayrollWeek = {
  key: string;
  weekStart: Date;
  inProgress: boolean;
  salesCount: number;
  salesTotal: number;
  percent: number;
  computed: number;
  amount: number;
  overridden: boolean;
  status: "DA_PAGARE" | "PAGATO";
  paidAt: Date | null;
  paidBy: string | null;
  notes: string | null;
  entryId: number | null;
};

export type PayrollUser = {
  userId: number;
  name: string;
  role: Role;
  active: boolean;
  percent: number;
  customPercent: boolean;
  weeks: PayrollWeek[]; // dalla più recente
  lastPaidAt: Date | null;
  lastPaidWeek: Date | null;
  arrears: PayrollWeek[]; // settimane concluse non pagate con importo > 0
  due: number;
  current: PayrollWeek | null;
  paidTotal: number;
};

type Entry = PayrollEntry & { paidBy: { displayName: string } | null };

function buildWeek(
  key: string,
  weekStart: Date,
  inProgress: boolean,
  live: { count: number; total: number },
  percent: number,
  entry: Entry | undefined,
): PayrollWeek {
  if (entry && entry.status === "PAGATO") {
    const computed = Number(entry.computedAmount ?? 0);
    return {
      key, weekStart, inProgress,
      salesCount: entry.salesCount ?? live.count,
      salesTotal: Number(entry.salesTotal ?? live.total),
      percent: Number(entry.percent ?? percent),
      computed,
      amount: Number(entry.paidAmount ?? entry.amountOverride ?? computed),
      overridden: entry.amountOverride != null,
      status: "PAGATO",
      paidAt: entry.paidAt,
      paidBy: entry.paidBy?.displayName ?? null,
      notes: entry.notes,
      entryId: entry.id,
    };
  }
  const computed = round2((live.total * percent) / 100);
  const override = entry?.amountOverride != null ? Number(entry.amountOverride) : null;
  return {
    key, weekStart, inProgress,
    salesCount: live.count,
    salesTotal: round2(live.total),
    percent,
    computed,
    amount: override ?? computed,
    overridden: override != null,
    status: "DA_PAGARE",
    paidAt: null,
    paidBy: null,
    notes: entry?.notes ?? null,
    entryId: entry?.id ?? null,
  };
}

/**
 * Registro stipendi calcolato:
 * - le settimane PAGATE usano la fotografia salvata al momento del pagamento;
 * - le altre sono calcolate dalle vendite (salvo importo modificato a mano).
 * Una settimana non diventa mai "pagata" da sola: serve la registrazione del pagamento.
 */
export async function payrollOverview(opts: { userId?: number; includeInactive?: boolean } = {}): Promise<PayrollUser[]> {
  const s = await getSettings();
  const types: ("STALLA" | "GOVERNO")[] = [];
  if (s.salaryIncludeStable) types.push("STALLA");
  if (s.salaryIncludeGov) types.push("GOVERNO");

  const users = await prisma.user.findMany({
    where: { ...(opts.userId ? { id: opts.userId } : {}) },
    orderBy: { displayName: "asc" },
  });
  const ids = users.map((u) => u.id);
  const [sales, entries] = await Promise.all([
    prisma.sale.findMany({
      where: { voided: false, sellerId: { in: ids }, type: { in: types } },
      select: { sellerId: true, soldAt: true, finalPrice: true },
    }),
    prisma.payrollEntry.findMany({ where: { userId: { in: ids } }, include: { paidBy: { select: { displayName: true } } } }),
  ]);

  const now = new Date();
  const currentWeek = weekStartOf(now, TZ);
  const currentKey = isoWeekKey(currentWeek, TZ);
  const out: PayrollUser[] = [];

  for (const u of users) {
    const mySales = sales.filter((x) => x.sellerId === u.id);
    const myEntries = entries.filter((e) => e.userId === u.id);
    if (!u.active && !opts.includeInactive && !mySales.length && !myEntries.length) continue;
    if (u.role === "ADMIN" && !mySales.length && !myEntries.length) continue;
    const percent = u.salaryPercent != null ? Number(u.salaryPercent) : s.salaryPercent;

    const byWeek = new Map<string, { count: number; total: number }>();
    let first = weekStartOf(u.createdAt, TZ);
    for (const sale of mySales) {
      const w = weekStartOf(sale.soldAt, TZ);
      if (w < first) first = w;
      const k = isoWeekKey(w, TZ);
      const b = byWeek.get(k) ?? { count: 0, total: 0 };
      b.count++;
      b.total += Number(sale.finalPrice);
      byWeek.set(k, b);
    }
    const entryByKey = new Map<string, Entry>();
    for (const e of myEntries) {
      entryByKey.set(isoWeekKey(e.weekStart, TZ), e);
      if (e.weekStart < first) first = e.weekStart;
    }

    const weeks: PayrollWeek[] = [];
    let w = currentWeek;
    let guard = 0;
    while (w >= first && guard++ < 520) {
      const key = isoWeekKey(w, TZ);
      weeks.push(buildWeek(key, w, key === currentKey, byWeek.get(key) ?? { count: 0, total: 0 }, percent, entryByKey.get(key)));
      w = addWeeks(w, -1, TZ);
    }
    const paid = weeks.filter((x) => x.status === "PAGATO");
    const lastPaid = paid.reduce<PayrollWeek | null>((m, x) => (!m || (x.paidAt && m.paidAt && x.paidAt > m.paidAt) ? x : m), null);
    const lastPaidWeek = paid.reduce<Date | null>((m, x) => (!m || x.weekStart > m ? x.weekStart : m), null);
    const arrears = weeks.filter((x) => !x.inProgress && x.status === "DA_PAGARE" && x.amount > 0);
    out.push({
      userId: u.id,
      name: u.displayName,
      role: u.role,
      active: u.active,
      percent,
      customPercent: u.salaryPercent != null,
      weeks,
      lastPaidAt: lastPaid?.paidAt ?? null,
      lastPaidWeek,
      arrears,
      due: round2(arrears.reduce((t, x) => t + x.amount, 0)),
      current: weeks.find((x) => x.inProgress) ?? null,
      paidTotal: round2(paid.reduce((t, x) => t + x.amount, 0)),
    });
  }
  return out;
}

/** Dati live di una settimana per un dipendente (usati quando si registra il pagamento). */
export async function liveWeek(userId: number, weekStart: Date) {
  const s = await getSettings();
  const types: ("STALLA" | "GOVERNO")[] = [];
  if (s.salaryIncludeStable) types.push("STALLA");
  if (s.salaryIncludeGov) types.push("GOVERNO");
  const agg = await prisma.sale.aggregate({
    where: { voided: false, sellerId: userId, type: { in: types }, soldAt: { gte: weekStart, lt: addWeeks(weekStart, 1, TZ) } },
    _count: true,
    _sum: { finalPrice: true },
  });
  const percent = await userSalaryPercent(userId, s);
  const total = Number(agg._sum.finalPrice ?? 0);
  return { count: agg._count, total: round2(total), percent, computed: round2((total * percent) / 100) };
}
