-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Spawn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL DEFAULT 'CAVALLO',
    "title" TEXT,
    "color" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "breedId" INTEGER,
    "coatId" INTEGER,
    "location" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Spawn_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Spawn_coatId_fkey" FOREIGN KEY ("coatId") REFERENCES "Coat" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Spawn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Spawn_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Spawn" ("breedId", "coatId", "createdAt", "createdById", "description", "id", "location", "notes", "updatedAt", "updatedById", "x", "y") SELECT "breedId", "coatId", "createdAt", "createdById", "description", "id", "location", "notes", "updatedAt", "updatedById", "x", "y" FROM "Spawn";
DROP TABLE "Spawn";
ALTER TABLE "new_Spawn" RENAME TO "Spawn";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

