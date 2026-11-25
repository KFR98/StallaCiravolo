-- Fattura unica in bottega: righe di addestramento e prezzo forfettario
ALTER TABLE "ItemSale" ADD COLUMN "listTotal" DECIMAL;
ALTER TABLE "ItemSaleLine" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'OGGETTO';
ALTER TABLE "ItemSaleLine" ADD COLUMN "coatId" INTEGER;
ALTER TABLE "ItemSaleLine" ADD COLUMN "breedName" TEXT;
ALTER TABLE "ItemSaleLine" ADD COLUMN "coatName" TEXT;
ALTER TABLE "ItemSaleLine" ADD COLUMN "plate" TEXT;
ALTER TABLE "ItemSaleLine" ADD COLUMN "rarity" TEXT;

-- Cassa: movimenti manuali
CREATE TABLE "CashMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" INTEGER,
    "userName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedById" INTEGER,
    "voidReason" TEXT
);
CREATE UNIQUE INDEX "CashMovement_requestId_key" ON "CashMovement"("requestId");
CREATE INDEX "CashMovement_createdAt_idx" ON "CashMovement"("createdAt");
