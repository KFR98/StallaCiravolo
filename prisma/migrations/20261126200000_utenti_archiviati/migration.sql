-- Utenti eliminati mantenendo lo storico: account chiuso per sempre, dati conservati
ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;
