import { prisma } from "./db";
import { imageUrl } from "./catalog";
import { round2 } from "./pricing";

export const HISTORY_TYPES = {
  CATTURA: "Catture",
  VENDITA: "Vendite in stalla",
  BLIP: "Vendite al blip",
  OGGETTI: "Vendite oggetti",
  PAGAMENTO: "Stipendi ricevuti",
  PASSAGGIO: "Passaggi di cavalli",
  RIMBORSO: "Rimborsi",
} as const;
export type HistoryType = keyof typeof HISTORY_TYPES;

export type HistoryEvent = {
  key: string;
  type: HistoryType;
  date: Date;
  title: string;
  detail?: string;
  amount?: number;
  /** "+" entrata per lo stalliere (stipendio, rimborso), "=" incasso per la stalla */
  sign?: "+" | "-" | "=";
  href?: string;
  image?: string | null;
  muted?: boolean;
};

type Range = { from?: Date; to?: Date };
const inRange = (r: Range) => (r.from || r.to ? { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) } : undefined);

/** Storico completo di un utente (più recenti prima). */
export async function userHistory(userId: number, opts: Range & { types?: HistoryType[]; limit?: number } = {}): Promise<HistoryEvent[]> {
  const want = (t: HistoryType) => !opts.types?.length || opts.types.includes(t);
  const dr = inRange(opts);
  const take = opts.limit ?? 500;
  const [captures, sales, items, payments, transfers, reimb] = await Promise.all([
    want("CATTURA") ? prisma.horse.findMany({ where: { capturedById: userId, ...(dr ? { capturedAt: dr } : {}) }, include: { breed: true, coat: true }, orderBy: { capturedAt: "desc" }, take }) : [],
    want("VENDITA") || want("BLIP")
      ? prisma.sale.findMany({ where: { sellerId: userId, ...(dr ? { soldAt: dr } : {}) }, include: { horse: { include: { coat: { select: { imagePath: true } } } } }, orderBy: { soldAt: "desc" }, take })
      : [],
    want("OGGETTI") ? prisma.itemSale.findMany({ where: { sellerId: userId, ...(dr ? { soldAt: dr } : {}) }, include: { lines: true }, orderBy: { soldAt: "desc" }, take }) : [],
    want("PAGAMENTO") ? prisma.payment.findMany({ where: { userId, ...(dr ? { createdAt: dr } : {}) }, include: { recordedBy: true }, orderBy: { createdAt: "desc" }, take }) : [],
    want("PASSAGGIO")
      ? prisma.horseTransfer.findMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }], ...(dr ? { createdAt: dr } : {}) }, include: { fromUser: true, toUser: true, horse: { include: { breed: true, coat: true } } }, orderBy: { createdAt: "desc" }, take })
      : [],
    want("RIMBORSO") ? prisma.reimbursement.findMany({ where: { userId, ...(dr ? { createdAt: dr } : {}) }, include: { supplier: true }, orderBy: { createdAt: "desc" }, take }) : [],
  ]);
  const ev: HistoryEvent[] = [];
  for (const h of captures)
    ev.push({ key: `c${h.id}`, type: "CATTURA", date: h.capturedAt, title: `Catturato ${h.breed.name} · ${h.coat.name}`, detail: h.status === "VENDUTO_GOVERNO" ? "venduto subito al blip" : h.plate ? `targa ${h.plate}` : undefined, href: `/stalla/${h.id}`, image: imageUrl(h.coat.imagePath) });
  for (const s of sales) {
    const t: HistoryType = s.type === "GOVERNO" ? "BLIP" : "VENDITA";
    if (!want(t)) continue;
    ev.push({ key: `s${s.id}`, type: t, date: s.soldAt, title: `${s.type === "GOVERNO" ? "Venduto al blip" : "Venduto"} ${s.breedName} · ${s.coatName}`, detail: s.voided ? `annullata: ${s.voidReason ?? ""}` : s.buyerName ? `a ${s.buyerName}` : undefined, amount: Number(s.finalPrice), sign: "=", href: `/stalla/${s.horseId}`, image: imageUrl(s.horse.coat.imagePath), muted: s.voided });
  }
  for (const s of items)
    ev.push({ key: `i${s.id}`, type: "OGGETTI", date: s.soldAt, title: `Vendita oggetti`, detail: s.lines.map((l) => `${l.quantity}× ${l.itemName}`).join(", "), amount: Number(s.total), sign: "=", muted: s.voided });
  for (const p of payments)
    ev.push({ key: `p${p.id}`, type: "PAGAMENTO", date: p.createdAt, title: p.action === "PAGATO" ? "Stipendio ricevuto" : "Pagamento annullato", detail: `${p.recordedBy ? "da " + p.recordedBy.displayName : ""}${Number(p.dueAmount) ? ` · spettavano $${Number(p.dueAmount)}` : ""}${p.notes ? ` · ${p.notes}` : ""}`, amount: Number(p.amount), sign: p.action === "PAGATO" ? "+" : "-", muted: p.action !== "PAGATO" });
  for (const t of transfers) {
    const out = t.fromUserId === userId;
    ev.push({ key: `t${t.id}`, type: "PASSAGGIO", date: t.createdAt, title: out ? `Passato ${t.horse.breed.name} a ${t.toUser.displayName}` : `Ricevuto ${t.horse.breed.name} da ${t.fromUser.displayName}`, detail: t.horse.coat.name + (t.notes ? ` · ${t.notes}` : ""), href: `/stalla/${t.horseId}`, image: imageUrl(t.horse.coat.imagePath) });
  }
  for (const r of reimb)
    ev.push({ key: `r${r.id}`, type: "RIMBORSO", date: r.createdAt, title: `Rimborso ${r.status === "PAGATO" ? "pagato" : r.status === "RESPINTO" ? "respinto" : "richiesto"}`, detail: `${r.description} · ${r.supplier?.name ?? r.supplierName ?? ""}`, amount: Number(r.amount), sign: r.status === "PAGATO" ? "+" : undefined, muted: r.status === "RESPINTO" });
  return ev.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, take);
}

/** Totali dell'utente da quando è stato assunto. */
export async function userTotals(userId: number) {
  const [user, captures, deposits, sales, items, payments, reimb, transfersIn, transfersOut] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.horse.count({ where: { capturedById: userId } }),
    prisma.horse.count({ where: { capturedById: userId, depositedAt: { not: null } } }),
    prisma.sale.groupBy({ by: ["type"], where: { sellerId: userId, voided: false }, _count: true, _sum: { finalPrice: true } }),
    prisma.itemSale.aggregate({ where: { sellerId: userId, voided: false }, _count: true, _sum: { total: true } }),
    prisma.payment.groupBy({ by: ["action"], where: { userId }, _sum: { amount: true } }),
    prisma.reimbursement.aggregate({ where: { userId, status: "PAGATO" }, _sum: { amount: true } }),
    prisma.horseTransfer.count({ where: { toUserId: userId } }),
    prisma.horseTransfer.count({ where: { fromUserId: userId } }),
  ]);
  const st = sales.find((s) => s.type === "STALLA");
  const gv = sales.find((s) => s.type === "GOVERNO");
  const paid = Number(payments.find((p) => p.action === "PAGATO")?._sum.amount ?? 0) - Number(payments.find((p) => p.action === "ANNULLATO")?._sum.amount ?? 0);
  const days = Math.max(1, Math.floor((Date.now() - user.createdAt.getTime()) / 86400_000));
  return {
    since: user.createdAt,
    days,
    captures,
    deposits,
    stableSales: st?._count ?? 0,
    stableRevenue: round2(Number(st?._sum.finalPrice ?? 0)),
    govSales: gv?._count ?? 0,
    govRevenue: round2(Number(gv?._sum.finalPrice ?? 0)),
    itemSales: items._count,
    itemsRevenue: round2(Number(items._sum.total ?? 0)),
    revenue: round2(Number(st?._sum.finalPrice ?? 0) + Number(gv?._sum.finalPrice ?? 0) + Number(items._sum.total ?? 0)),
    salaryPaid: round2(paid),
    reimbursed: round2(Number(reimb._sum.amount ?? 0)),
    transfersIn,
    transfersOut,
  };
}
