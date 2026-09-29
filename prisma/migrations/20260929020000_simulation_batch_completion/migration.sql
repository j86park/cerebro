CREATE TABLE "SimulationBatchCompletion" (
    "runId" TEXT NOT NULL,
    "batchStart" INTEGER NOT NULL,
    "clientStart" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulationBatchCompletion_pkey" PRIMARY KEY ("runId", "batchStart", "clientStart")
);

ALTER TABLE "SimulationBatchCompletion" ADD CONSTRAINT "SimulationBatchCompletion_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "SimulationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
