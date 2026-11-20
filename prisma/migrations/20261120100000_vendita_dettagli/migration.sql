-- Vendita cavallo: prezzo base, addestramento e oggetti venduti insieme
ALTER TABLE "Sale" ADD COLUMN "basePrice" DECIMAL;
ALTER TABLE "Sale" ADD COLUMN "trainingPrice" DECIMAL;
ALTER TABLE "Sale" ADD COLUMN "itemsTotal" DECIMAL;
ALTER TABLE "Sale" ADD COLUMN "itemSaleId" INTEGER;
