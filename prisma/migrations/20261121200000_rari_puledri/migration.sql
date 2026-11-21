-- Cavalli rari/leggendari, puledri nati in stalla e conteggio dei parti
ALTER TABLE "Horse" ADD COLUMN "foalCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Horse" ADD COLUMN "rarity" TEXT;
ALTER TABLE "Horse" ADD COLUMN "motherId" INTEGER;
ALTER TABLE "Horse" ADD COLUMN "bornAt" DATETIME;
ALTER TABLE "Horse" ADD COLUMN "needsData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Horse" ADD COLUMN "needsStaff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Horse" ADD COLUMN "birthSetAt" DATETIME;
