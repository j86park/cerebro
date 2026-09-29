ALTER TABLE "Client" ADD COLUMN "simulationRunId" TEXT;

CREATE INDEX "Client_simulationRunId_id_idx" ON "Client"("simulationRunId", "id");

ALTER TABLE "Client" ADD CONSTRAINT "Client_simulationRunId_fkey"
  FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AgentType" ADD VALUE 'SYSTEM';
ALTER TYPE "ActionType" ADD VALUE 'DOCUMENT_ACCESS_DENIED';
