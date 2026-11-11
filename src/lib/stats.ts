import { prisma } from "./db";
import { TZ } from "./format";
import { dayStartOf, weekStartOf, addWeeks } from "./weeks";
import { formatInTimeZone } from "date-fns-tz";

export async function salesSummary(from: Date, to: Date, sellerId?: number) {
  const rows = await prisma.sale.groupBy({
    by: ["type"],
    where: { voided: false, soldAt: { gte: from, lt: to }, ...(sellerId ? { sellerId } : {}) },
    _sum: { finalPrice: true },
    _count: true,
  });
  const get = (t: "STALLA" | "GOVERNO") => rows.find((r) => r.type === t);
  return {
    count: rows.reduce((s, r) => s + r._count, 0),
    total: rows.reduce((s, r) => s + Number(r._sum.finalPrice ?? 0), 0),
    stableCount: get("STALLA")?._count ?? 0,
    stableTotal: Number(get("STALLA")?._sum.finalPrice ?? 0),
    govCount: get("GOVERNO")?._count ?? 0,
    govTotal: Number(get("GOVERNO")?._sum.finalPrice ?? 0),
  };
}

/** Andamento giornaliero delle vendite degli ultimi `days` giorni. */
export async function dailyTrend(days: number, sellerId?: number) {
  const today = dayStartOf(new Date(), TZ);
  const from = new Date(today.getTime() - (days - 1) * 86400_000 - 3 * 3600_000);
  const sales = await prisma.sale.findMany({
    where: { voided: false, soldAt: { gte: from }, ...(sellerId ? { sellerId } : {}) },
    select: { soldAt: true, finalPrice: true, type: true },
  });
  const buckets = new Map<string, { day: string; stalla: number; governo: number; n: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = formatInTimeZone(d, TZ, "yyyy-MM-dd");
    buckets.set(key, { day: formatInTimeZone(d, TZ, "dd/MM"), stalla: 0, governo: 0, n: 0 });
  }
  for (const s of sales) {
    const b = buckets.get(formatInTimeZone(s.soldAt, TZ, "yyyy-MM-dd"));
    if (!b) continue;
    if (s.type === "GOVERNO") b.governo += Number(s.finalPrice);
    else b.stalla += Number(s.finalPrice);
    b.n++;
  }
  return [...buckets.values()].map((b) => ({ ...b, stalla: Math.round(b.stalla * 100) / 100, governo: Math.round(b.governo * 100) / 100 }));
}

export type EmployeeStats = {
  userId: number;
  name: string;
  role: string;
  active: boolean;
  captures: number;
  deposits: number;
  sales: number;
  govSales: number;
  stableSales: number;
  revenue: number;
  govRevenue: number;
  stableRevenue: number;
  itemsRevenue: number;
  itemSales: number;
};

/** Statistiche per dipendente in un intervallo (undefined = da sempre). */
export async function employeeStats(from?: Date, to?: Date): Promise<EmployeeStats[]> {
  const range = from && to ? { gte: from, lt: to } : undefined;
  const [users, caps, deps, sales, items] = await Promise.all([
    prisma.user.findMany({ orderBy: { displayName: "asc" } }),
    prisma.horse.groupBy({ by: ["capturedById"], where: range ? { capturedAt: range } : {}, _count: true }),
    prisma.horse.groupBy({ by: ["capturedById"], where: { depositedAt: range ?? { not: null } }, _count: true }),
    prisma.sale.groupBy({ by: ["sellerId", "type"], where: { voided: false, ...(range ? { soldAt: range } : {}) }, _count: true, _sum: { finalPrice: true } }),
    prisma.itemSale.groupBy({ by: ["sellerId"], where: { voided: false, ...(range ? { soldAt: range } : {}) }, _count: true, _sum: { total: true } }),
  ]);
  return users.map((u) => {
    const s = sales.filter((x) => x.sellerId === u.id);
    const g = s.find((x) => x.type === "GOVERNO");
    const st = s.find((x) => x.type === "STALLA");
    const it = items.find((x) => x.sellerId === u.id);
    return {
      userId: u.id,
      name: u.displayName,
      role: u.role,
      active: u.active,
      itemsRevenue: Number(it?._sum.total ?? 0),
      itemSales: it?._count ?? 0,
      captures: caps.find((c) => c.capturedById === u.id)?._count ?? 0,
      deposits: deps.find((c) => c.capturedById === u.id)?._count ?? 0,
      sales: (g?._count ?? 0) + (st?._count ?? 0),
      govSales: g?._count ?? 0,
      stableSales: st?._count ?? 0,
      revenue: Number(g?._sum.finalPrice ?? 0) + Number(st?._sum.finalPrice ?? 0),
      govRevenue: Number(g?._sum.finalPrice ?? 0),
      stableRevenue: Number(st?._sum.finalPrice ?? 0),
    };
  });
}

export function periods(now = new Date()) {
  const today = dayStartOf(now, TZ);
  const tomorrow = new Date(today.getTime() + 86400_000 + 2 * 3600_000);
  const week = weekStartOf(now, TZ);
  return { today, tomorrow: dayStartOf(tomorrow, TZ), week, nextWeek: addWeeks(week, 1, TZ) };
}

/** Punteggio dello "stalliere della settimana": premia sia le vendite sia l'attività. */
export const SCORE_RULES = { capture: 1, stableSale: 3, govSale: 1, itemSale: 1, per100: 1 };

export function activityScore(e: EmployeeStats) {
  return (
    e.captures * SCORE_RULES.capture +
    e.stableSales * SCORE_RULES.stableSale +
    e.govSales * SCORE_RULES.govSale +
    e.itemSales * SCORE_RULES.itemSale +
    Math.floor((e.revenue + e.itemsRevenue) / 100) * SCORE_RULES.per100
  );
}

/** Classifica della settimana (esclusi gli account senza attività). */
export async function weeklyRanking(from: Date, to: Date) {
  return (await employeeStats(from, to))
    .map((e) => ({ ...e, score: activityScore(e) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || b.revenue - a.revenue);
}
