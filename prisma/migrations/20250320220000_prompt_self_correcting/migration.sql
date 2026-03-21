-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "mutationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptMutationJob" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "triggerEvalRunId" TEXT NOT NULL,
    "taxonomy" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "candidateVersionId" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "expectedShadowRuns" INTEGER NOT NULL DEFAULT 3,
    "candidateVersionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptMutationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowRunResult" (
    "id" TEXT NOT NULL,
    "mutationJobId" TEXT NOT NULL,
    "candidateVersionId" TEXT,
    "targetDelta" DOUBLE PRECISION NOT NULL,
    "corpusDelta" DOUBLE PRECISION NOT NULL,
    "canaryDelta" DOUBLE PRECISION NOT NULL,
    "overallDelta" DOUBLE PRECISION NOT NULL,
    "gateDecision" TEXT NOT NULL DEFAULT 'pending',
    "scoreBreakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowRunResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptLesson" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "failureType" TEXT NOT NULL,
    "triggerPattern" TEXT NOT NULL,
    "lessonText" TEXT NOT NULL,
    "passedGate" BOOLEAN NOT NULL DEFAULT false,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "regressionCount" INTEGER NOT NULL DEFAULT 0,
    "lastValidatedAt" TIMESTAMP(3),
    "sourceJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptLesson_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptMutationJob" ADD CONSTRAINT "PromptMutationJob_candidateVersionId_fkey" FOREIGN KEY ("candidateVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowRunResult" ADD CONSTRAINT "ShadowRunResult_mutationJobId_fkey" FOREIGN KEY ("mutationJobId") REFERENCES "PromptMutationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PromptVersion_agentId_isActive_idx" ON "PromptVersion"("agentId", "isActive");

-- CreateIndex
CREATE INDEX "PromptMutationJob_agentId_status_idx" ON "PromptMutationJob"("agentId", "status");

-- CreateIndex
CREATE INDEX "ShadowRunResult_mutationJobId_idx" ON "ShadowRunResult"("mutationJobId");

-- CreateIndex
CREATE INDEX "PromptLesson_agentId_passedGate_idx" ON "PromptLesson"("agentId", "passedGate");
