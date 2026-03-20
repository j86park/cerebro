-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('RRSP', 'TFSA', 'INVESTMENT', 'CORPORATE', 'JOINT');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'STALLED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('MISSING', 'REQUESTED', 'PENDING_REVIEW', 'VALID', 'EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'COMPLIANCE', 'SUITABILITY', 'LEGAL', 'ESTATE', 'FUNDING');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GOVERNMENT_ID', 'PROOF_OF_ADDRESS', 'SIN_SSN_FORM', 'KYC_FORM', 'AML_VERIFICATION', 'NAAF', 'RISK_QUESTIONNAIRE', 'INVESTMENT_POLICY_STATEMENT', 'SUITABILITY_ASSESSMENT', 'CLIENT_AGREEMENT', 'FEE_DISCLOSURE', 'ACCREDITED_INVESTOR_FORM', 'BENEFICIARY_DESIGNATION', 'BANKING_INFORMATION', 'DEPOSIT_CONFIRMATION', 'ARTICLES_OF_INCORPORATION', 'AUTHORIZED_SIGNATORY_LIST');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('COMPLIANCE', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('SCAN_VAULT', 'NOTIFY_ADVISOR', 'SEND_CLIENT_REMINDER', 'ESCALATE_COMPLIANCE', 'ESCALATE_MANAGEMENT', 'MARK_RESOLVED', 'REQUEST_DOCUMENT', 'VALIDATE_DOCUMENT', 'ADVANCE_STAGE', 'COMPLETE_ONBOARDING', 'ALERT_ADVISOR_STUCK');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('SCHEDULED', 'EVENT_UPLOAD', 'MANUAL', 'SIMULATION');

-- CreateEnum
CREATE TYPE "RiskProfile" AS ENUM ('CONSERVATIVE', 'MODERATE', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "AdvisorRole" AS ENUM ('ADVISOR', 'COMPLIANCE_OFFICER');

-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "complianceOfficerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advisor" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdvisorRole" NOT NULL DEFAULT 'ADVISOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "onboardingStage" INTEGER NOT NULL DEFAULT 0,
    "riskProfile" "RiskProfile",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'MISSING',
    "uploadedAt" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "notificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastNotifiedAt" TIMESTAMP(3),
    "fileRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "documentId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "trigger" "TriggerType" NOT NULL DEFAULT 'SCHEDULED',
    "reasoning" TEXT NOT NULL,
    "outcome" TEXT,
    "nextScheduledAt" TIMESTAMP(3),
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "clientCount" INTEGER NOT NULL,
    "simulatedDays" INTEGER NOT NULL,
    "clientResponseRate" DOUBLE PRECISION NOT NULL,
    "advisorResponseRate" DOUBLE PRECISION NOT NULL,
    "randomSeed" TEXT NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'PENDING',
    "batchesCompleted" INTEGER NOT NULL DEFAULT 0,
    "batchesTotal" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "gitCommit" TEXT,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "scenarioResults" JSONB NOT NULL,
    "scorerBreakdown" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Advisor_email_key" ON "Advisor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE INDEX "AgentAction_clientId_performedAt_idx" ON "AgentAction"("clientId", "performedAt");

-- CreateIndex
CREATE INDEX "AgentAction_agentType_actionType_idx" ON "AgentAction"("agentType", "actionType");

-- AddForeignKey
ALTER TABLE "Firm" ADD CONSTRAINT "Firm_complianceOfficerId_fkey" FOREIGN KEY ("complianceOfficerId") REFERENCES "Advisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advisor" ADD CONSTRAINT "Advisor_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "Advisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

