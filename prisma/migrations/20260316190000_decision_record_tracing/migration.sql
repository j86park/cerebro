-- CreateTable DecisionRecord (examiner SoR decision log + Mastra trace correlation)
CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "stage" INTEGER,
    "traceId" TEXT NOT NULL,
    "policyVersion" TEXT,
    "policyFired" TEXT,
    "toolProposed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toolExecuted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refusalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewer" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "contentCaptured" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionRecord_clientId_decidedAt_idx" ON "DecisionRecord"("clientId", "decidedAt");

-- CreateIndex
CREATE INDEX "DecisionRecord_jobId_idx" ON "DecisionRecord"("jobId");

-- CreateIndex
CREATE INDEX "DecisionRecord_traceId_idx" ON "DecisionRecord"("traceId");

-- CreateIndex
CREATE INDEX "DecisionRecord_clientId_jobId_idx" ON "DecisionRecord"("clientId", "jobId");

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
