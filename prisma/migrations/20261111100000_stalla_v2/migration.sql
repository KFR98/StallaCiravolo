-- CreateTable
CREATE TABLE "HorseTransfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "horseId" INTEGER NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "byUserId" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HorseTransfer_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HorseTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HorseTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HorseTransfer_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "price" DECIMAL,
    "priceNote" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "activity" TEXT,
    "goods" TEXT,
    "missiva" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APERTA',
    "response" TEXT,
    "createdById" INTEGER NOT NULL,
    "handledById" INTEGER,
    "handledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShopNote_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RICHIESTO',
    "response" TEXT,
    "handledById" INTEGER,
    "handledAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reimbursement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reimbursement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reimbursement_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemSale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sellerId" INTEGER NOT NULL,
    "sellerName" TEXT NOT NULL,
    "buyerName" TEXT,
    "total" DECIMAL NOT NULL,
    "notes" TEXT,
    "soldAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedById" INTEGER,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemSale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemSale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemSaleLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "saleId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    CONSTRAINT "ItemSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ItemSale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemSaleLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Horse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "breedId" INTEGER NOT NULL,
    "coatId" INTEGER NOT NULL,
    "sex" TEXT,
    "plate" TEXT,
    "status" TEXT NOT NULL,
    "condition" TEXT,
    "notes" TEXT,
    "ageBase" DECIMAL,
    "ageCheckpointAt" DATETIME NOT NULL,
    "initialAge" DECIMAL,
    "ownerId" INTEGER NOT NULL,
    "pregnantSince" DATETIME,
    "pregnancyDueAt" DATETIME,
    "capturedById" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depositedAt" DATETIME,
    "exitedAt" DATETIME,
    "exitReason" TEXT,
    "requestId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Horse_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Horse_coatId_fkey" FOREIGN KEY ("coatId") REFERENCES "Coat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Horse_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Horse_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Horse" ("ageBase", "ageCheckpointAt", "breedId", "capturedAt", "capturedById", "coatId", "condition", "createdAt", "depositedAt", "exitReason", "exitedAt", "id", "initialAge", "notes", "plate", "requestId", "sex", "status", "updatedAt", "version", "ownerId") SELECT "ageBase", "ageCheckpointAt", "breedId", "capturedAt", "capturedById", "coatId", "condition", "createdAt", "depositedAt", "exitReason", "exitedAt", "id", "initialAge", "notes", "plate", "requestId", "sex", "status", "updatedAt", "version", "capturedById" FROM "Horse";
DROP TABLE "Horse";
ALTER TABLE "new_Horse" RENAME TO "Horse";
CREATE UNIQUE INDEX "Horse_requestId_key" ON "Horse"("requestId");
CREATE INDEX "Horse_status_idx" ON "Horse"("status");
CREATE INDEX "Horse_ownerId_idx" ON "Horse"("ownerId");
CREATE INDEX "Horse_capturedById_idx" ON "Horse"("capturedById");
CREATE INDEX "Horse_capturedAt_idx" ON "Horse"("capturedAt");
CREATE INDEX "Horse_plate_idx" ON "Horse"("plate");
CREATE TABLE "new_Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "payrollEntryId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "dueAmount" DECIMAL NOT NULL DEFAULT 0,
    "amount" DECIMAL NOT NULL,
    "action" TEXT NOT NULL,
    "recordedById" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("action", "amount", "createdAt", "id", "notes", "payrollEntryId", "recordedById", "userId", "weekStart", "dueAmount") SELECT "action", "amount", "createdAt", "id", "notes", "payrollEntryId", "recordedById", "userId", "weekStart", "amount" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE TABLE "new_PayrollEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DA_PAGARE',
    "stableTotal" DECIMAL,
    "govTotal" DECIMAL,
    "itemsTotal" DECIMAL,
    "pctStable" DECIMAL,
    "pctGov" DECIMAL,
    "pctItems" DECIMAL,
    "computedAmount" DECIMAL,
    "amountOverride" DECIMAL,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "paidById" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollEntry_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PayrollEntry" ("amountOverride", "computedAmount", "createdAt", "id", "notes", "paidAmount", "paidAt", "paidById", "status", "updatedAt", "userId", "weekStart") SELECT "amountOverride", "computedAmount", "createdAt", "id", "notes", coalesce("paidAmount", 0) AS "paidAmount", "paidAt", "paidById", "status", "updatedAt", "userId", "weekStart" FROM "PayrollEntry";
DROP TABLE "PayrollEntry";
ALTER TABLE "new_PayrollEntry" RENAME TO "PayrollEntry";
CREATE UNIQUE INDEX "PayrollEntry_userId_weekStart_key" ON "PayrollEntry"("userId", "weekStart");
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
    "discountType" TEXT,
    "discountValue" DECIMAL,
    "finalPrice" DECIMAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "sellerName" TEXT NOT NULL,
    "buyerName" TEXT,
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
    CONSTRAINT "Sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("ageAtSale", "breedName", "buyerName", "coatName", "createdAt", "discountType", "discountValue", "finalPrice", "horseId", "id", "listPrice", "notes", "plate", "priceBracket", "sellerId", "sellerName", "sex", "soldAt", "type", "updatedAt", "voidReason", "voided", "voidedAt", "voidedById") SELECT "ageAtSale", "breedName", "buyerName", "coatName", "createdAt", "discountType", "discountValue", "finalPrice", "horseId", "id", "listPrice", "notes", "plate", "priceBracket", "sellerId", "sellerName", "sex", "soldAt", "type", "updatedAt", "voidReason", "voided", "voidedAt", "voidedById" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE INDEX "Sale_soldAt_idx" ON "Sale"("soldAt");
CREATE INDEX "Sale_sellerId_soldAt_idx" ON "Sale"("sellerId", "soldAt");
CREATE INDEX "Sale_type_idx" ON "Sale"("type");
CREATE INDEX "Sale_horseId_idx" ON "Sale"("horseId");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DIPENDENTE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pctStable" DECIMAL,
    "pctGov" DECIMAL,
    "pctItems" DECIMAL,
    "notes" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("active", "createdAt", "displayName", "id", "lastLoginAt", "notes", "passwordHash", "role", "updatedAt", "username", "pctStable", "pctGov") SELECT "active", "createdAt", "displayName", "id", "lastLoginAt", "notes", "passwordHash", "role", "updatedAt", "username", "salaryPercent", "salaryPercent" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HorseTransfer_horseId_idx" ON "HorseTransfer"("horseId");

-- CreateIndex
CREATE INDEX "Reimbursement_userId_idx" ON "Reimbursement"("userId");

-- CreateIndex
CREATE INDEX "Reimbursement_status_idx" ON "Reimbursement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSale_requestId_key" ON "ItemSale"("requestId");

-- CreateIndex
CREATE INDEX "ItemSale_soldAt_idx" ON "ItemSale"("soldAt");

-- CreateIndex
CREATE INDEX "ItemSale_sellerId_soldAt_idx" ON "ItemSale"("sellerId", "soldAt");

