import { prisma } from "./db";
import type { StatRow } from "@/components/StatBars";

export function imageUrl(path: string | null | undefined) {
  return path ? `/api/images/${path.split("/").map(encodeURIComponent).join("/")}` : null;
}

/** Definizioni statistiche + massimo di ogni colonna (= valore del cavallo migliore). */
export async function getStatMeta() {
  const defs = await prisma.statDefinition.findMany({ orderBy: { sortOrder: "asc" } });
  const maxRows = await prisma.coatStat.groupBy({
    by: ["statId"],
    _max: { value: true },
    where: { coat: { archived: false } },
  });
  const max = new Map(maxRows.map((r) => [r.statId, Number(r._max.value ?? 0)]));
  return defs.map((d) => ({ id: d.id, key: d.key, label: d.label, max: max.get(d.id) || 0 }));
}

export type StatMeta = Awaited<ReturnType<typeof getStatMeta>>;

export function statRows(meta: StatMeta, values: { statId: number; value: unknown }[]): StatRow[] {
  const byId = new Map(values.map((v) => [v.statId, v.value == null ? null : Number(v.value)]));
  return meta.map((m) => ({ label: m.label, value: byId.get(m.id) ?? null, max: m.max }));
}

/** Razze e manti attivi per i menu a tendina (filtrati). */
export async function getBreedOptions() {
  const breeds = await prisma.breed.findMany({
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { coats: { where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  return breeds.map((b) => ({
    id: b.id,
    name: b.name,
    isCustom: b.isCustom,
    coats: b.coats.map((c) => ({
      id: c.id,
      name: c.name,
      image: imageUrl(c.imagePath),
      salePriceA: c.salePriceA == null ? null : Number(c.salePriceA),
      salePriceB: c.salePriceB == null ? null : Number(c.salePriceB),
      governmentPrice: c.governmentPrice == null ? null : Number(c.governmentPrice),
      govListPrice: c.govListPrice == null ? null : Number(c.govListPrice),
    })),
  }));
}

export type BreedOption = Awaited<ReturnType<typeof getBreedOptions>>[number];

/** Voto 0-10: media delle statistiche rapportate al massimo del catalogo. */
export function coatScore(meta: StatMeta, values: { statId: number; value: unknown }[]): number | null {
  const byId = new Map(values.map((v) => [v.statId, v.value == null ? null : Number(v.value)]));
  const parts = meta.filter((m) => m.max > 0 && byId.get(m.id) != null).map((m) => (byId.get(m.id)! / m.max) * 10);
  if (!parts.length) return null;
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
}

/** Dati del catalogo per le pagine client (ricerca e filtri in tempo reale). */
export async function getCatalogRows() {
  const meta = await getStatMeta();
  const coats = await prisma.coat.findMany({
    where: { archived: false, breed: { archived: false } },
    include: { breed: true, stats: true },
    orderBy: [{ breed: { sortOrder: "asc" } }, { breed: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });
  const n = (v: unknown) => (v == null ? null : Number(v));
  const rows = coats.map((c) => {
    const byId = new Map(c.stats.map((s) => [s.statId, n(s.value)]));
    return {
      id: c.id,
      breedId: c.breedId,
      breed: c.breed.name,
      breedCustom: c.breed.isCustom,
      coat: c.name,
      image: imageUrl(c.imagePath),
      salePriceA: n(c.salePriceA),
      salePriceB: n(c.salePriceB),
      governmentPrice: n(c.governmentPrice),
      govListPrice: n(c.govListPrice),
      basePriceA: n(c.basePriceA),
      basePriceB: n(c.basePriceB),
      trainingPrice: n(c.trainingPrice),
      stats: meta.map((m) => byId.get(m.id) ?? null),
      score: coatScore(meta, c.stats),
    };
  });
  return { meta: meta.map((m) => ({ label: m.label, max: m.max })), rows };
}

export type CatalogRow = Awaited<ReturnType<typeof getCatalogRows>>["rows"][number];
export type CatalogMeta = { label: string; max: number }[];
