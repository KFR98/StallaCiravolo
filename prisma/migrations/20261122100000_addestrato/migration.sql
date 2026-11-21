-- Cavallo già addestrato in stalla
ALTER TABLE "Horse" ADD COLUMN "trained" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Horse" ADD COLUMN "trainedAt" DATETIME;
ALTER TABLE "Horse" ADD COLUMN "trainedById" INTEGER;
