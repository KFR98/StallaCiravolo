import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { round2 } from "./pricing";
import type { SaleKind } from "@/components/SaleTag";

/**
 * Tutte le vendite in un unico elenco: cavalli dalla stalla, vendite al blip e fatture della bottega.
 * Una vendita di cavallo con addestramento e oggetti è UNA fattura con tre etichette.
 */

export type FeedLine = { kind: "cavallo" | "addestramento" | "vetrina"; label: string; qty: number; amount: number };
export type FeedEntry = {
  key: string;
  source: "sale" | "itemSale";
  id: number;
  tags: SaleKind[];
  title: string;
  subtitle: string | null;
  horseId: number | null;
  image: string | null;
  plate: string | null;
  sellerId: number;
  sellerName: string;
  buyerName: string | null;
  soldAt: Date;
  total: number;
  listTotal: number | null;
  /** quanto della fattura va a ciascun tipo (per i totali) */
  parts: Partial<Record<SaleKind, number>>;
  lines: FeedLine[];
  voided: boolean;
  voidReason: string | null;
  notes: string | null;
  /** solo vendite di cavalli: dati per la correzione */
  saleType: "STALLA" | "GOVERNO" | null;
};

export type FeedFilter = {
  sellerId?: number;
  customerId?: number;
  soldAt?: Prisma.DateTimeFilter;
  q?: string;
  includeVoided?: boolean;
  /** limite di sicurezza per vendite caricate per tipo */
  cap?: number;
};

export async function salesFeed(f: FeedFilter, imageUrl: (p: string | null) => string | null): Promise<FeedEntry[]> {
  const cap = f.cap ?? 5000;
  const q = f.q?.trim().slice(0, 100);
  const saleWhere: Prisma.SaleWhereInput = {
    ...(f.sellerId ? { sellerId: f.sellerId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.soldAt ? { soldAt: f.soldAt } : {}),
    ...(f.includeVoided ? {} : { voided: false }),
    ...(q ? { OR: [{ breedName: { contains: q } }, { coatName: { contains: q } }, { plate: { contains: q } }, { buyerName: { contains: q } }, { sellerName: { contains: q } }] } : {}),
  };
  const sales = await prisma.sale.findMany({
    where: saleWhere, orderBy: { soldAt: "desc" }, take: cap,
    include: { horse: { select: { coat: { select: { imagePath: true } } } } },
  });
  // fatture della bottega collegate a una vendita di cavallo: compaiono dentro quella
  const linkedIds = (await prisma.sale.findMany({ where: { itemSaleId: { not: null } }, select: { itemSaleId: true } })).map((s) => s.itemSaleId!);
  const linkedLines = await prisma.itemSaleLine.findMany({ where: { saleId: { in: sales.map((s) => s.itemSaleId).filter((x): x is number => x != null) } } });

  const itemWhere: Prisma.ItemSaleWhereInput = {
    id: { notIn: linkedIds },
    ...(f.sellerId ? { sellerId: f.sellerId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.soldAt ? { soldAt: f.soldAt } : {}),
    ...(f.includeVoided ? {} : { voided: false }),
    ...(q ? { OR: [{ buyerName: { contains: q } }, { sellerName: { contains: q } }, { lines: { some: { itemName: { contains: q } } } }] } : {}),
  };
  const itemSales = await prisma.itemSale.findMany({ where: itemWhere, orderBy: { soldAt: "desc" }, take: cap, include: { lines: true } });

  const out: FeedEntry[] = [];
  for (const s of sales) {
    const gov = s.type === "GOVERNO";
    const lines: FeedLine[] = [];
    const horsePart = Number(s.finalPrice);
    const training = s.trainingPrice != null ? Number(s.trainingPrice) : 0;
    lines.push({ kind: "cavallo", label: `${s.breedName} – ${s.coatName}`, qty: 1, amount: horsePart });
    const extra = linkedLines.filter((l) => l.saleId === s.itemSaleId);
    for (const l of extra) lines.push({ kind: "vetrina", label: l.itemName, qty: l.quantity, amount: Number(l.lineTotal) });
    const itemsTotal = s.itemsTotal != null ? Number(s.itemsTotal) : 0;
    const tags: SaleKind[] = gov ? ["blip"] : ["cavallo"];
    if (!gov && training > 0) tags.push("addestramento");
    if (itemsTotal > 0) tags.push("vetrina");
    // l'addestramento venduto col cavallo è dentro il prezzo del cavallo (sconto compreso): lo stimiamo in proporzione
    const listHorse = s.listPrice != null ? Number(s.listPrice) : horsePart;
    const trainPart = training > 0 && listHorse > 0 ? round2((horsePart * training) / listHorse) : 0;
    out.push({
      key: `s${s.id}`, source: "sale", id: s.id, tags,
      title: `${s.breedName} – ${s.coatName}`,
      subtitle: [gov ? "Venduto al blip del Governo" : s.priceBracket, training > 0 ? "con addestramento" : null].filter(Boolean).join(" · ") || null,
      horseId: s.horseId, image: imageUrl(s.horse.coat.imagePath), plate: s.plate,
      sellerId: s.sellerId, sellerName: s.sellerName, buyerName: s.buyerName, soldAt: s.soldAt,
      total: round2(horsePart + itemsTotal), listTotal: null,
      parts: gov ? { blip: horsePart } : { cavallo: round2(horsePart - trainPart), ...(trainPart ? { addestramento: trainPart } : {}), ...(itemsTotal ? { vetrina: itemsTotal } : {}) },
      lines, voided: s.voided, voidReason: s.voidReason, notes: s.notes, saleType: s.type,
    });
  }
  for (const s of itemSales) {
    const total = Number(s.total);
    const list = s.lines.reduce((t, l) => t + Number(l.lineTotal), 0);
    const train = s.lines.filter((l) => l.kind === "ADDESTRAMENTO").reduce((t, l) => t + Number(l.lineTotal), 0);
    const trainPart = list > 0 ? round2((total * train) / list) : 0;
    const tags: SaleKind[] = [];
    if (train > 0) tags.push("addestramento");
    if (s.lines.some((l) => l.kind !== "ADDESTRAMENTO")) tags.push("vetrina");
    const trainings = s.lines.filter((l) => l.kind === "ADDESTRAMENTO");
    const objects = s.lines.filter((l) => l.kind !== "ADDESTRAMENTO");
    const title = [
      trainings.length === 1 ? `Addestramento ${trainings[0].breedName ?? ""} – ${trainings[0].coatName ?? ""}`.trim() : trainings.length > 1 ? `${trainings.length} addestramenti` : null,
      objects.length ? objects.map((l) => `${l.quantity}× ${l.itemName}`).join(", ") : null,
    ].filter(Boolean).join(" + ");
    out.push({
      key: `i${s.id}`, source: "itemSale", id: s.id, tags, title: title || "Fattura bottega",
      subtitle: s.listTotal != null && Number(s.listTotal) !== total ? `Prezzo forfettario (listino $${Number(s.listTotal)})` : null,
      horseId: null, image: null, plate: trainings.length === 1 ? trainings[0].plate : null,
      sellerId: s.sellerId, sellerName: s.sellerName, buyerName: s.buyerName, soldAt: s.soldAt,
      total, listTotal: s.listTotal != null ? Number(s.listTotal) : null,
      parts: { ...(trainPart ? { addestramento: trainPart } : {}), ...(total - trainPart > 0 ? { vetrina: round2(total - trainPart) } : {}) },
      lines: s.lines.map((l) => ({ kind: l.kind === "ADDESTRAMENTO" ? "addestramento" : "vetrina", label: l.itemName, qty: l.quantity, amount: Number(l.lineTotal) })),
      voided: s.voided, voidReason: s.voidReason, notes: s.notes, saleType: null,
    });
  }
  return out;
}

export const SORTS = [
  ["recenti", "Più recenti"],
  ["vecchie", "Più vecchie"],
  ["importo", "Importo più alto"],
  ["importo-asc", "Importo più basso"],
  ["nome", "Alfabetico (A→Z)"],
  ["stalliere", "Stalliere (A→Z)"],
  ["acquirente", "Acquirente (A→Z)"],
] as const;
export type SortKey = (typeof SORTS)[number][0];

export function sortFeed(list: FeedEntry[], sort: string) {
  const cmp = (a: string, b: string) => a.localeCompare(b, "it", { sensitivity: "base" });
  const byDate = (a: FeedEntry, b: FeedEntry) => b.soldAt.getTime() - a.soldAt.getTime();
  const fns: Record<string, (a: FeedEntry, b: FeedEntry) => number> = {
    recenti: byDate,
    vecchie: (a, b) => -byDate(a, b),
    importo: (a, b) => b.total - a.total || byDate(a, b),
    "importo-asc": (a, b) => a.total - b.total || byDate(a, b),
    nome: (a, b) => cmp(a.title, b.title) || byDate(a, b),
    stalliere: (a, b) => cmp(a.sellerName, b.sellerName) || byDate(a, b),
    acquirente: (a, b) => cmp(a.buyerName ?? "￿", b.buyerName ?? "￿") || byDate(a, b),
  };
  return [...list].sort(fns[sort] ?? byDate);
}

/** Somme per tipo (solo vendite valide). */
export function feedTotals(list: FeedEntry[]) {
  const t = { total: 0, count: 0, cavallo: 0, addestramento: 0, vetrina: 0, blip: 0, n: { cavallo: 0, addestramento: 0, vetrina: 0, blip: 0 } };
  for (const e of list) {
    if (e.voided) continue;
    t.total += e.total;
    t.count++;
    for (const [k, v] of Object.entries(e.parts) as [SaleKind, number][]) t[k] += v;
    for (const k of e.tags) t.n[k]++;
  }
  t.total = round2(t.total);
  for (const k of ["cavallo", "addestramento", "vetrina", "blip"] as const) t[k] = round2(t[k]);
  return t;
}
