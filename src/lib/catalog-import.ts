import { prisma } from "./db";
import type { ParsedListino } from "./excel-import";
import { audit } from "./audit";

export type ImportMode = "solo_nuovi" | "aggiorna";

export type ImportResult = {
  breedsCreated: number;
  coatsCreated: number;
  coatsUpdated: number;
  coatsSkipped: number;
  statsCreated: number;
};

/**
 * Importa il listino nel database.
 * - "solo_nuovi": aggiunge razze/manti mancanti, non tocca quelli esistenti.
 * - "aggiorna": aggiorna anche prezzi e statistiche dei manti esistenti (con storico prezzi).
 * Non elimina mai nulla.
 */
export async function applyListino(
  parsed: ParsedListino,
  mode: ImportMode,
  actor: { id: number; username: string } | null,
): Promise<ImportResult> {
  const res: ImportResult = { breedsCreated: 0, coatsCreated: 0, coatsUpdated: 0, coatsSkipped: 0, statsCreated: 0 };

  await prisma.$transaction(
    async (tx) => {
      // Statistiche
      const statIds = new Map<string, number>();
      let order = 0;
      for (const s of parsed.statColumns) {
        let def = await tx.statDefinition.findUnique({ where: { key: s.key } });
        if (!def) {
          def = await tx.statDefinition.create({ data: { key: s.key, label: s.label, sortOrder: order } });
          res.statsCreated++;
        }
        statIds.set(s.key, def.id);
        order++;
      }

      let breedOrder = (await tx.breed.count()) === 0 ? 0 : 1000;
      const breedIds = new Map<string, number>();
      for (const row of parsed.rows) {
        let breedId = breedIds.get(row.breedName);
        if (!breedId) {
          let breed = await tx.breed.findUnique({ where: { name: row.breedName } });
          if (!breed) {
            breed = await tx.breed.create({
              data: {
                name: row.breedName,
                originalName: row.breedOriginal,
                isCustom: row.isCustom,
                sortOrder: breedOrder++,
              },
            });
            res.breedsCreated++;
          }
          breedId = breed.id;
          breedIds.set(row.breedName, breedId);
        }

        const existing = await tx.coat.findUnique({ where: { breedId_name: { breedId, name: row.coatName } } });
        const priceData = {
          govListPrice: row.prices.govListPrice,
          basePriceA: row.prices.basePriceA,
          basePriceB: row.prices.basePriceB,
          trainingPrice: row.prices.trainingPrice,
          salePriceA: row.prices.salePriceA,
          salePriceB: row.prices.salePriceB,
          governmentPrice: row.prices.governmentPrice,
        };
        let coatId: number;
        if (!existing) {
          const c = await tx.coat.create({
            data: {
              breedId,
              name: row.coatName,
              originalName: row.coatOriginal,
              sortOrder: row.row,
              ...priceData,
            },
          });
          coatId = c.id;
          res.coatsCreated++;
        } else if (mode === "aggiorna") {
          coatId = existing.id;
          for (const [k, v] of Object.entries(priceData)) {
            const old = existing[k as keyof typeof priceData];
            const oldN = old == null ? null : Number(old);
            if (oldN !== v) {
              await tx.priceHistory.create({
                data: { coatId, field: k, oldValue: oldN, newValue: v, changedById: actor?.id ?? null },
              });
            }
          }
          await tx.coat.update({ where: { id: coatId }, data: priceData });
          res.coatsUpdated++;
        } else {
          res.coatsSkipped++;
          continue;
        }

        for (const [key, value] of Object.entries(row.stats)) {
          const statId = statIds.get(key)!;
          await tx.coatStat.upsert({
            where: { coatId_statId: { coatId, statId } },
            create: { coatId, statId, value },
            update: { value },
          });
        }
      }

      await audit(
        actor,
        "IMPORT_LISTINO",
        "Catalogo",
        null,
        `Importazione listino (${mode}): ${res.breedsCreated} razze nuove, ${res.coatsCreated} manti nuovi, ${res.coatsUpdated} aggiornati`,
        { ...res, anomalie: parsed.anomalies.length },
        tx,
      );
    },
    { timeout: 120_000 },
  );
  return res;
}
