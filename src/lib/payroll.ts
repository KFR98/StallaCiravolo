import type { PayrollEntry, Role } from "@prisma/client";
import { prisma } from "./db";
import { getSettings, type Settings } from "./settings";
import { TZ } from "./format";
import { weekStartOf, addWeeks, isoWeekKey } from "./weeks";
import { round2 } from "./pricing";

export type Percents = { stable: number; gov: number; items: number };

export function userPercents(u: { pctStable: unknown; pctGov: unknown; pctItems: unknown }, s: Settings): Percents & { custom: boolean } {
  return {
    stable: u.pctStable != null ? Number(u.pctStable) : s.pctStable,
    gov: u.pctGov != null ? Number(u.pctGov) : s.pctGov,
    items: u.pctItems != null ? Number(u.pctItems) : s.pctItems,
    custom: u.pctStable != null || u.pctGov != null || u.pctItems != null,
  };
}

export const computeSalary = (t: { stable: number; gov: number; items: number }, p: Percents) =>
  round2((t.stable * p.stable + t.gov * p.gov + t.items * p.items) / 100);

export type WeekTotals = { stable: number; gov: number; items: number; count: number };

export type PayrollWeek = {
  key: string;
  weekStart: Date;
  inProgress: boolean;
  totals: WeekTotals;
  percents: Percents;
  computed: number;
  /** Quanto spetta (calcolo o importo modificato) */
  due: number;
  overridden: boolean;
  paid: number;
  /** Quanto manca da pagare (0 se saldato) */
  residual: number;
  /** Quanto pagato in più del dovuto (incentivo) */
  extra: number;
  status: "DA_PAGARE" | "PARZIALE" | "PAGATO";
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
  percents: Percents & { custom: boolean };
  weeks: PayrollWeek[]; // dalla più recente
  lastPaidAt: Date | null;
  arrears: PayrollWeek[]; // settimane concluse con residuo > 0 (dalla più vecchia)
  due: number;
  current: PayrollWeek | null;
  paidTotal: number;
};

type Entry = PayrollEntry & { paidBy: { displayName: string } | null };

export function buildWeek(key: string, weekStart: Date, inProgress: boolean, live: WeekTotals, pct: Percents, entry: Entry | undefined): PayrollWeek {
  const paid = entry ? Number(entry.paidAmount) : 0;
  // Dopo il primo pagamento i totali restano "fotografati"
  const snap = entry && entry.computedAmount != null && paid > 0;
  const totals = snap ? { stable: Number(entry.stableTotal ?? 0), gov: Number(entry.govTotal ?? 0), items: Number(entry.itemsTotal ?? 0), count: live.count } : live;
  const percents = snap ? { stable: Number(entry.pctStable ?? pct.stable), gov: Number(entry.pctGov ?? pct.gov), items: Number(entry.pctItems ?? pct.items) } : pct;
  const computed = snap ? Number(entry.computedAmount) : computeSalary(totals, percents);
  const override = entry?.amountOverride != null ? Number(entry.amountOverride) : null;
  const due = override ?? computed;
  const residual = round2(Math.max(0, due - paid));
  const extra = round2(Math.max(0, paid - due));
  const status = paid <= 0 ? "DA_PAGARE" : residual > 0.004 ? "PARZIALE" : "PAGATO";
  return {
    key, weekStart, inProgress, totals, percents, computed, due, overridden: override != null, paid, residual, extra, status,
    paidAt: entry?.paidAt ?? null, paidBy: entry?.paidBy?.displayName ?? null, notes: entry?.notes ?? null, entryId: entry?.id ?? null,
  };
}

/** Totali settimanali per utente (vendite stalla, blip, oggetti), escluse le vendite annullate. */
async function weeklyTotals(userIds: number[]) {
  const [sales, items] = await Promise.all([
    prisma.sale.findMany({ where: { voided: false, sellerId: { in: userIds } }, select: { sellerId: true, soldAt: true, finalPrice: true, type: true } }),
    prisma.itemSale.findMany({ where: { voided: false, sellerId: { in: userIds } }, select: { sellerId: true, soldAt: true, total: true } }),
  ]);
  const map = new Map<string, WeekTotals & { weekStart: Date }>();
  const add = (uid: number, d: Date, k: "stable" | "gov" | "items", v: number) => {
    const w = weekStartOf(d, TZ);
    const key = `${uid}|${isoWeekKey(w, TZ)}`;
    const t = map.get(key) ?? { stable: 0, gov: 0, items: 0, count: 0, weekStart: w };
    t[k] += v;
    t.count++;
    map.set(key, t);
  };
  for (const s of sales) add(s.sellerId, s.soldAt, s.type === "GOVERNO" ? "gov" : "stable", Number(s.finalPrice));
  for (const s of items) add(s.sellerId, s.soldAt, "items", Number(s.total));
  return map;
}

/**
 * Registro stipendi. Una settimana risulta pagata solo dopo la registrazione di un pagamento;
 * le settimane concluse con un residuo da pagare sono "arretrati".
 */
export async function payrollOverview(opts: { userId?: number; includeInactive?: boolean } = {}): Promise<PayrollUser[]> {
  const s = await getSettings();
  const users = await prisma.user.findMany({ where: opts.userId ? { id: opts.userId } : {}, orderBy: { displayName: "asc" } });
  const ids = users.map((u) => u.id);
  const [totals, entries] = await Promise.all([
    weeklyTotals(ids),
    prisma.payrollEntry.findMany({ where: { userId: { in: ids } }, include: { paidBy: { select: { displayName: true } } } }),
  ]);
  const currentWeek = weekStartOf(new Date(), TZ);
  const currentKey = isoWeekKey(currentWeek, TZ);
  const out: PayrollUser[] = [];

  for (const u of users) {
    const myEntries = entries.filter((e) => e.userId === u.id);
    const myTotals = [...totals.entries()].filter(([k]) => k.startsWith(u.id + "|"));
    if (!opts.userId && !u.active && !opts.includeInactive && !myTotals.length && !myEntries.length) continue;
    if (!opts.userId && u.role === "ADMIN" && !myTotals.length && !myEntries.length) continue;
    const pct = userPercents(u, s);
    let first = weekStartOf(u.createdAt, TZ);
    for (const [, t] of myTotals) if (t.weekStart < first) first = t.weekStart;
    for (const e of myEntries) if (e.weekStart < first) first = e.weekStart;
    const entryByKey = new Map(myEntries.map((e) => [isoWeekKey(e.weekStart, TZ), e]));
    const weeks: PayrollWeek[] = [];
    let w = currentWeek;
    let guard = 0;
    while (w >= first && guard++ < 520) {
      const key = isoWeekKey(w, TZ);
      const t = totals.get(`${u.id}|${key}`) ?? { stable: 0, gov: 0, items: 0, count: 0 };
      weeks.push(buildWeek(key, w, key === currentKey, t, pct, entryByKey.get(key)));
      w = addWeeks(w, -1, TZ);
    }
    const arrears = weeks.filter((x) => !x.inProgress && x.residual > 0).reverse();
    const lastPaidAt = weeks.reduce<Date | null>((m, x) => (x.paidAt && (!m || x.paidAt > m) ? x.paidAt : m), null);
    out.push({
      userId: u.id, name: u.displayName, role: u.role, active: u.active, percents: pct, weeks, lastPaidAt, arrears,
      due: round2(arrears.reduce((t, x) => t + x.residual, 0)),
      current: weeks.find((x) => x.inProgress) ?? null,
      paidTotal: round2(weeks.reduce((t, x) => t + x.paid, 0)),
    });
  }
  return out;
}

/** Stima dello stipendio della settimana in corso per un utente (dashboard). */
export async function currentWeekEstimate(userId: number) {
  const [ov] = await payrollOverview({ userId });
  return ov?.current ?? null;
}
