-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'DIRETTORE', 'GESTORE', 'DIPENDENTE') NOT NULL DEFAULT 'DIPENDENTE',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `salaryPercent` DECIMAL(5, 2) NULL,
    `notes` TEXT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(64) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,

    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Breed` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `originalName` VARCHAR(120) NULL,
    `description` TEXT NULL,
    `isCustom` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Breed_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `breedId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `originalName` VARCHAR(120) NULL,
    `description` TEXT NULL,
    `imagePath` VARCHAR(255) NULL,
    `govListPrice` DECIMAL(10, 2) NULL,
    `basePriceA` DECIMAL(10, 2) NULL,
    `basePriceB` DECIMAL(10, 2) NULL,
    `trainingPrice` DECIMAL(10, 2) NULL,
    `salePriceA` DECIMAL(10, 2) NULL,
    `salePriceB` DECIMAL(10, 2) NULL,
    `governmentPrice` DECIMAL(10, 2) NULL,
    `notes` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Coat_breedId_name_key`(`breedId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StatDefinition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(40) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `StatDefinition_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoatStat` (
    `coatId` INTEGER NOT NULL,
    `statId` INTEGER NOT NULL,
    `value` DECIMAL(6, 2) NULL,

    PRIMARY KEY (`coatId`, `statId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `coatId` INTEGER NOT NULL,
    `field` VARCHAR(40) NOT NULL,
    `oldValue` DECIMAL(10, 2) NULL,
    `newValue` DECIMAL(10, 2) NULL,
    `changedById` INTEGER NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PriceHistory_coatId_idx`(`coatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Horse` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `breedId` INTEGER NOT NULL,
    `coatId` INTEGER NOT NULL,
    `sex` ENUM('MASCHIO', 'FEMMINA') NOT NULL,
    `plate` VARCHAR(40) NOT NULL,
    `status` ENUM('IN_STALLA', 'VENDUTO', 'VENDUTO_GOVERNO', 'RIMOSSO') NOT NULL,
    `condition` VARCHAR(60) NULL,
    `notes` TEXT NULL,
    `ageBase` DECIMAL(8, 3) NOT NULL,
    `ageCheckpointAt` DATETIME(3) NOT NULL,
    `initialAge` DECIMAL(8, 3) NOT NULL,
    `capturedById` INTEGER NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `depositedAt` DATETIME(3) NULL,
    `exitedAt` DATETIME(3) NULL,
    `exitReason` VARCHAR(255) NULL,
    `requestId` VARCHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Horse_requestId_key`(`requestId`),
    INDEX `Horse_status_idx`(`status`),
    INDEX `Horse_capturedById_idx`(`capturedById`),
    INDEX `Horse_capturedAt_idx`(`capturedAt`),
    INDEX `Horse_plate_idx`(`plate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `horseId` INTEGER NOT NULL,
    `type` ENUM('STALLA', 'GOVERNO') NOT NULL,
    `breedName` VARCHAR(120) NOT NULL,
    `coatName` VARCHAR(120) NOT NULL,
    `sex` ENUM('MASCHIO', 'FEMMINA') NOT NULL,
    `plate` VARCHAR(40) NOT NULL,
    `ageAtSale` DECIMAL(8, 3) NOT NULL,
    `priceBracket` VARCHAR(40) NOT NULL,
    `listPrice` DECIMAL(10, 2) NULL,
    `discountType` ENUM('PERCENTUALE', 'IMPORTO') NULL,
    `discountValue` DECIMAL(10, 2) NULL,
    `finalPrice` DECIMAL(10, 2) NOT NULL,
    `sellerId` INTEGER NOT NULL,
    `sellerName` VARCHAR(100) NOT NULL,
    `buyerName` VARCHAR(120) NULL,
    `notes` TEXT NULL,
    `soldAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voided` BOOLEAN NOT NULL DEFAULT false,
    `voidedAt` DATETIME(3) NULL,
    `voidedById` INTEGER NULL,
    `voidReason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Sale_soldAt_idx`(`soldAt`),
    INDEX `Sale_sellerId_soldAt_idx`(`sellerId`, `soldAt`),
    INDEX `Sale_type_idx`(`type`),
    INDEX `Sale_horseId_idx`(`horseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Spawn` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `breedId` INTEGER NULL,
    `coatId` INTEGER NULL,
    `location` VARCHAR(120) NULL,
    `description` TEXT NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NOT NULL,
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reservation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NULL,
    `customerName` VARCHAR(120) NULL,
    `missiva` VARCHAR(40) NULL,
    `breedId` INTEGER NULL,
    `coatId` INTEGER NULL,
    `plate` VARCHAR(40) NULL,
    `price` DECIMAL(10, 2) NULL,
    `deposit` DECIMAL(10, 2) NULL,
    `deliveryDate` DATETIME(3) NULL,
    `status` ENUM('DA_CATTURARE', 'PRENOTATO', 'VENDIBILE_DA_TUTTI', 'AFFARE_CHIUSO', 'ANNULLATO') NOT NULL DEFAULT 'PRENOTATO',
    `assignedToId` INTEGER NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NOT NULL,
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Reservation_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `status` ENUM('DA_PAGARE', 'PAGATO') NOT NULL DEFAULT 'DA_PAGARE',
    `salesCount` INTEGER NULL,
    `salesTotal` DECIMAL(12, 2) NULL,
    `percent` DECIMAL(5, 2) NULL,
    `computedAmount` DECIMAL(12, 2) NULL,
    `amountOverride` DECIMAL(12, 2) NULL,
    `paidAmount` DECIMAL(12, 2) NULL,
    `paidAt` DATETIME(3) NULL,
    `paidById` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayrollEntry_userId_weekStart_key`(`userId`, `weekStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payrollEntryId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `action` ENUM('PAGATO', 'ANNULLATO') NOT NULL,
    `recordedById` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(60) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `username` VARCHAR(50) NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(40) NULL,
    `summary` VARCHAR(500) NOT NULL,
    `details` TEXT NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Coat` ADD CONSTRAINT `Coat_breedId_fkey` FOREIGN KEY (`breedId`) REFERENCES `Breed`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoatStat` ADD CONSTRAINT `CoatStat_coatId_fkey` FOREIGN KEY (`coatId`) REFERENCES `Coat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoatStat` ADD CONSTRAINT `CoatStat_statId_fkey` FOREIGN KEY (`statId`) REFERENCES `StatDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceHistory` ADD CONSTRAINT `PriceHistory_coatId_fkey` FOREIGN KEY (`coatId`) REFERENCES `Coat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceHistory` ADD CONSTRAINT `PriceHistory_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Horse` ADD CONSTRAINT `Horse_breedId_fkey` FOREIGN KEY (`breedId`) REFERENCES `Breed`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Horse` ADD CONSTRAINT `Horse_coatId_fkey` FOREIGN KEY (`coatId`) REFERENCES `Coat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Horse` ADD CONSTRAINT `Horse_capturedById_fkey` FOREIGN KEY (`capturedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_horseId_fkey` FOREIGN KEY (`horseId`) REFERENCES `Horse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Spawn` ADD CONSTRAINT `Spawn_breedId_fkey` FOREIGN KEY (`breedId`) REFERENCES `Breed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Spawn` ADD CONSTRAINT `Spawn_coatId_fkey` FOREIGN KEY (`coatId`) REFERENCES `Coat`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Spawn` ADD CONSTRAINT `Spawn_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Spawn` ADD CONSTRAINT `Spawn_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_breedId_fkey` FOREIGN KEY (`breedId`) REFERENCES `Breed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_coatId_fkey` FOREIGN KEY (`coatId`) REFERENCES `Coat`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollEntry` ADD CONSTRAINT `PayrollEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollEntry` ADD CONSTRAINT `PayrollEntry_paidById_fkey` FOREIGN KEY (`paidById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_payrollEntryId_fkey` FOREIGN KEY (`payrollEntryId`) REFERENCES `PayrollEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
