-- Doppia verifica (codice a 6 cifre da app): segreto cifrato, codici di recupero (impronte), ultimo intervallo usato
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "totpRecovery" TEXT;
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
