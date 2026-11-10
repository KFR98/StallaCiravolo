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
