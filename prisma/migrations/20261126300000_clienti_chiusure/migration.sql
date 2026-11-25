-- Rubrica clienti, prenotazioni chiuse con una vendita, chiusure di cassa
-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "missiva" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CashClosure" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "periodFrom" DATETIME,
    "periodTo" DATETIME NOT NULL,
    "expected" DECIMAL NOT NULL,
    "counted" DECIMAL,
    "difference" DECIMAL,
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "userId" INTEGER,
    "userName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ItemSale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sellerId" INTEGER NOT NULL,
    "sellerName" TEXT NOT NULL,
    "buyerName" TEXT,
    "customerId" INTEGER,
    "total" DECIMAL NOT NULL,
    "listTotal" DECIMAL,
    "notes" TEXT,
    "soldAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedById" INTEGER,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemSale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ItemSale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ItemSale" ("buyerName", "createdAt", "id", "listTotal", "notes", "requestId", "sellerId", "sellerName", "soldAt", "total", "voidReason", "voided", "voidedAt", "voidedById") SELECT "buyerName", "createdAt", "id", "listTotal", "notes", "requestId", "sellerId", "sellerName", "soldAt", "total", "voidReason", "voided", "voidedAt", "voidedById" FROM "ItemSale";
DROP TABLE "ItemSale";
ALTER TABLE "new_ItemSale" RENAME TO "ItemSale";
CREATE UNIQUE INDEX "ItemSale_requestId_key" ON "ItemSale"("requestId");
CREATE INDEX "ItemSale_soldAt_idx" ON "ItemSale"("soldAt");
CREATE INDEX "ItemSale_sellerId_soldAt_idx" ON "ItemSale"("sellerId", "soldAt");
CREATE INDEX "ItemSale_customerId_idx" ON "ItemSale"("customerId");
CREATE TABLE "new_Reservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT,
    "customerName" TEXT,
    "customerId" INTEGER,
    "saleRef" TEXT,
    "missiva" TEXT,
    "breedId" INTEGER,
    "coatId" INTEGER,
    "plate" TEXT,
    "price" DECIMAL,
    "deposit" DECIMAL,
    "deliveryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PRENOTATO',
    "assignedToId" INTEGER,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_coatId_fkey" FOREIGN KEY ("coatId") REFERENCES "Coat" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reservation" ("assignedToId", "breedId", "coatId", "createdAt", "createdById", "customerName", "deliveryDate", "deposit", "id", "missiva", "notes", "plate", "price", "status", "title", "updatedAt", "updatedById") SELECT "assignedToId", "breedId", "coatId", "createdAt", "createdById", "customerName", "deliveryDate", "deposit", "id", "missiva", "notes", "plate", "price", "status", "title", "updatedAt", "updatedById" FROM "Reservation";
DROP TABLE "Reservation";
ALTER TABLE "new_Reservation" RENAME TO "Reservation";
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "horseId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "breedName" TEXT NOT NULL,
    "coatName" TEXT NOT NULL,
    "sex" TEXT,
    "plate" TEXT,
    "ageAtSale" DECIMAL,
    "priceBracket" TEXT NOT NULL,
    "listPrice" DECIMAL,
    "basePrice" DECIMAL,
    "trainingPrice" DECIMAL,
    "itemsTotal" DECIMAL,
    "itemSaleId" INTEGER,
    "discountType" TEXT,
    "discountValue" DECIMAL,
    "finalPrice" DECIMAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "sellerName" TEXT NOT NULL,
    "buyerName" TEXT,
    "customerId" INTEGER,
    "notes" TEXT,
    "soldAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedById" INTEGER,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("ageAtSale", "basePrice", "breedName", "buyerName", "coatName", "createdAt", "discountType", "discountValue", "finalPrice", "horseId", "id", "itemSaleId", "itemsTotal", "listPrice", "notes", "plate", "priceBracket", "sellerId", "sellerName", "sex", "soldAt", "trainingPrice", "type", "updatedAt", "voidReason", "voided", "voidedAt", "voidedById") SELECT "ageAtSale", "basePrice", "breedName", "buyerName", "coatName", "createdAt", "discountType", "discountValue", "finalPrice", "horseId", "id", "itemSaleId", "itemsTotal", "listPrice", "notes", "plate", "priceBracket", "sellerId", "sellerName", "sex", "soldAt", "trainingPrice", "type", "updatedAt", "voidReason", "voided", "voidedAt", "voidedById" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE INDEX "Sale_soldAt_idx" ON "Sale"("soldAt");
CREATE INDEX "Sale_sellerId_soldAt_idx" ON "Sale"("sellerId", "soldAt");
CREATE INDEX "Sale_type_idx" ON "Sale"("type");
CREATE INDEX "Sale_horseId_idx" ON "Sale"("horseId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nameKey_key" ON "Customer"("nameKey");

-- CreateIndex
CREATE INDEX "CashClosure_periodTo_idx" ON "CashClosure"("periodTo");

