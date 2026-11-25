import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { round2 } from "./pricing";

/**
 * Cassa della stalla, calcolata sempre dai dati (niente saldo scritto a mano che può sbagliare):
 *   + vendite (cavalli in stalla, fatture della bottega, e — se scelto in Impostazioni — vendite al blip)
 *   − stipendi pagati (meno quelli annullati) e rimborsi pagati (se scelto in Impostazioni)
 *   ± movimenti manuali: prelievi, versamenti, allineamenti al contante reale.
 */

export type CashKind = "VENDITA" | "BOTTEGA" | "BLIP" | "STIPENDIO" | "RIMBORSO" | "PRELIEVO" | "VERSAMENTO" | "RETTIFICA";
export const CASH_KIND_LABEL: Record<CashKind, string> = {
  VENDITA: "Vendita cavallo",
  BOTTEGA: "Fattura bottega",
  BLIP: "Vendita al blip",
  STIPENDIO: "Stipendio",
  RIMBORSO: "Rimborso",
  PRELIEVO: "Prelievo",
  VERSAMENTO: "Versamento",
  RETTIFICA: "Allineamento",
};

export type CashEntry = {
  key: string;
  kind: CashKind;
  at: Date;
  amount: number; // + entra, − esce
  text: string;
  who: string | null;
  /** solo movimenti manuali */
  movementId: number | null;
  voided: boolean;
  voidReason: string | null;
  balanceAfter: number;
};

/** Tutti i movimenti, dal più vecchio, con il saldo dopo ognuno. I movimenti annullati restano visibili ma non contano. */
export async function cashLedger(tx: Prisma.TransactionClient = prisma): Promise<CashEntry[]> {
  const s = await getSettings();
  const [sales, itemSales, payments, reimb, moves] = await Promise.all([
    tx.sale.findMany({ where: { voided: false, ...(s.cashCountGov ? {} : { type: "STALLA" }) }, select: { id: true, type: true, finalPrice: true, soldAt: true, sellerName: true, breedName: true, coatName: true, plate: true } }),
    tx.itemSale.findMany({ where: { voided: false }, select: { id: true, total: true, soldAt: true, sellerName: true, lines: { select: { itemName: true, quantity: true, kind: true } } } }),
    s.cashCountPayroll ? tx.payment.findMany({ include: { user: { select: { displayName: true } }, recordedBy: { select: { displayName: true } } } }) : Promise.resolve([]),
    s.cashCountReimbursements ? tx.reimbursement.findMany({ where: { status: "PAGATO" }, include: { user: { select: { displayName: true } } } }) : Promise.resolve([]),
    tx.cashMovement.findMany(),
  ]);
  const raw: Omit<CashEntry, "balanceAfter">[] = [];
  for (const x of sales) {
    raw.push({
      key: `s${x.id}`, kind: x.type === "GOVERNO" ? "BLIP" : "VENDITA", at: x.soldAt, amount: Number(x.finalPrice),
      text: `${x.breedName} – ${x.coatName}${x.plate ? ` (${x.plate})` : ""}`, who: x.sellerName, movementId: null, voided: false, voidReason: null,
    });
  }
  for (const x of itemSales) {
    raw.push({
      key: `i${x.id}`, kind: "BOTTEGA", at: x.soldAt, amount: Number(x.total),
      text: x.lines.map((l) => (l.kind === "ADDESTRAMENTO" ? l.itemName : `${l.quantity}× ${l.itemName}`)).join(", ").slice(0, 200),
      who: x.sellerName, movementId: null, voided: false, voidReason: null,
    });
  }
  for (const p of payments) {
    const out = p.action === "PAGATO";
    raw.push({
      key: `p${p.id}`, kind: "STIPENDIO", at: p.createdAt, amount: out ? -Number(p.amount) : Number(p.amount),
      text: out ? `Stipendio pagato a ${p.user.displayName}` : `Pagamento stipendio annullato (${p.user.displayName}): rientra in cassa`,
      who: p.recordedBy?.displayName ?? null, movementId: null, voided: false, voidReason: null,
    });
  }
  for (const r of reimb) {
    raw.push({
      key: `r${r.id}`, kind: "RIMBORSO", at: r.paidAt ?? r.handledAt ?? r.createdAt, amount: -Number(r.amount),
      text: `Rimborso a ${r.user.displayName}: ${r.description}`.slice(0, 200), who: null, movementId: null, voided: false, voidReason: null,
    });
  }
  for (const m of moves) {
    raw.push({
      key: `m${m.id}`, kind: m.kind as CashKind, at: m.createdAt, amount: Number(m.amount), text: m.reason, who: m.userName,
      movementId: m.id, voided: m.voided, voidReason: m.voidReason,
    });
  }
  raw.sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key));
  let bal = 0;
  return raw.map((e) => {
    if (!e.voided) bal = round2(bal + e.amount);
    return { ...e, balanceAfter: bal };
  });
}

export async function cashBalance(tx: Prisma.TransactionClient = prisma) {
  const l = await cashLedger(tx);
  return l.length ? l[l.length - 1].balanceAfter : 0;
}
