-- CreateTable
CREATE TABLE "AppRole" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "access" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

