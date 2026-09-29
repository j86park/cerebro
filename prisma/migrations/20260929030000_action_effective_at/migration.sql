ALTER TABLE "AgentAction" ADD COLUMN "effectiveAt" TIMESTAMP(3);

UPDATE "AgentAction" SET "effectiveAt" = "performedAt" WHERE "effectiveAt" IS NULL;

CREATE INDEX "AgentAction_clientId_effectiveAt_idx" ON "AgentAction"("clientId", "effectiveAt");
