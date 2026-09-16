-- CreateEnum
CREATE TYPE "PromptEnvironment" AS ENUM ('STAGING', 'PRODUCTION');

-- CreateTable
CREATE TABLE "PromptEnvironmentPointer" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "environment" "PromptEnvironment" NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "previousPromptVersionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptEnvironmentPointer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptEnvironmentPointer_agentId_environment_key" ON "PromptEnvironmentPointer"("agentId", "environment");

-- CreateIndex
CREATE INDEX "PromptEnvironmentPointer_promptVersionId_idx" ON "PromptEnvironmentPointer"("promptVersionId");

-- AddForeignKey
ALTER TABLE "PromptEnvironmentPointer" ADD CONSTRAINT "PromptEnvironmentPointer_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptEnvironmentPointer" ADD CONSTRAINT "PromptEnvironmentPointer_previousPromptVersionId_fkey" FOREIGN KEY ("previousPromptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: for each agent with an active PromptVersion, point staging + production at it.
INSERT INTO "PromptEnvironmentPointer" ("id", "agentId", "environment", "promptVersionId", "previousPromptVersionId", "updatedAt", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || pv."agentId" || 'STAGING'),
  pv."agentId",
  'STAGING'::"PromptEnvironment",
  pv."id",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PromptVersion" pv
WHERE pv."isActive" = true
ON CONFLICT ("agentId", "environment") DO NOTHING;

INSERT INTO "PromptEnvironmentPointer" ("id", "agentId", "environment", "promptVersionId", "previousPromptVersionId", "updatedAt", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || pv."agentId" || 'PRODUCTION'),
  pv."agentId",
  'PRODUCTION'::"PromptEnvironment",
  pv."id",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PromptVersion" pv
WHERE pv."isActive" = true
ON CONFLICT ("agentId", "environment") DO NOTHING;
