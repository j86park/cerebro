-- CreateEnum
CREATE TYPE "LedgerActor" AS ENUM ('AGENT', 'ADVISOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'RESOLVED', 'TIMED_OUT', 'SAFE_HOLD');

-- AlterTable AgentAction: ActionLedger control-plane fields
ALTER TABLE "AgentAction" ADD COLUMN "stage" INTEGER;
ALTER TABLE "AgentAction" ADD COLUMN "policyVersion" TEXT;
ALTER TABLE "AgentAction" ADD COLUMN "promptVersionId" TEXT;
ALTER TABLE "AgentAction" ADD COLUMN "actor" "LedgerActor" NOT NULL DEFAULT 'AGENT';
ALTER TABLE "AgentAction" ADD COLUMN "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AgentAction" ADD COLUMN "citedFields" JSONB;
ALTER TABLE "AgentAction" ADD COLUMN "idempotencyKey" TEXT;

-- CreateTable EscalationState
CREATE TABLE "EscalationState" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "documentId" TEXT,
    "ladderStage" INTEGER NOT NULL DEFAULT 0,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "openKey" TEXT,
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policyVersion" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EscalationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable OnboardingStage
CREATE TABLE "OnboardingStage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklistSnapshot" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_clientId_idempotencyKey_key" ON "AgentAction"("clientId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationState_clientId_openKey_key" ON "EscalationState"("clientId", "openKey");

-- CreateIndex
CREATE INDEX "EscalationState_clientId_status_idx" ON "EscalationState"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStage_clientId_key" ON "OnboardingStage"("clientId");

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationState" ADD CONSTRAINT "EscalationState_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationState" ADD CONSTRAINT "EscalationState_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStage" ADD CONSTRAINT "OnboardingStage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
