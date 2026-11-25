-- Bottega: sottogruppo degli oggetti (modificabile dalla scheda dell'oggetto) e collegamento addestramento -> cavallo in stalla
ALTER TABLE "ShopItem" ADD COLUMN "subgroup" TEXT;
ALTER TABLE "ItemSaleLine" ADD COLUMN "horseId" INTEGER;

-- Proposta iniziale per gli oggetti del gruppo Cavalli (solo dove non c'è già un sottogruppo)
UPDATE "ShopItem" SET "subgroup" = 'Ferri' WHERE "subgroup" IS NULL AND "group" = 'Cavalli' AND "name" LIKE 'Ferr%';
UPDATE "ShopItem" SET "subgroup" = 'Cura e cibo' WHERE "subgroup" IS NULL AND "group" = 'Cavalli' AND ("name" LIKE 'Carot%' OR "name" LIKE 'Zuccher%' OR "name" LIKE 'Medicin%' OR "name" LIKE 'Anabolizz%' OR "name" LIKE 'Stimolant%' OR "name" LIKE '%soccorso%' OR "name" LIKE 'Mel%' OR "name" LIKE 'Fieno%' OR "name" LIKE 'Avena%');
UPDATE "ShopItem" SET "subgroup" = 'Finimenti e borse' WHERE "subgroup" IS NULL AND "group" = 'Cavalli' AND ("name" LIKE 'Sell%' OR "name" LIKE 'Staff%' OR "name" LIKE 'Copert%' OR "name" LIKE 'Corno%' OR "name" LIKE 'Bisacc%' OR "name" LIKE 'Maschera%' OR "name" LIKE 'Briglia%' OR "name" LIKE 'Kit%');
UPDATE "ShopItem" SET "subgroup" = 'Estetica' WHERE "subgroup" IS NULL AND "group" = 'Cavalli' AND ("name" LIKE 'Coda%' OR "name" LIKE 'Criniera%' OR "name" LIKE 'Peli%' OR "name" LIKE 'Spazzol%');
UPDATE "ShopItem" SET "subgroup" = 'Viaggio' WHERE "subgroup" IS NULL AND "group" = 'Cavalli' AND ("name" LIKE 'Lantern%' OR "name" LIKE 'Sacco a pelo%' OR "name" LIKE 'Tenda%');
