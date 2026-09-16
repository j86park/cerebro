-- AlterTable EscalationState: durable HITL suspend context for Mastra resume
ALTER TABLE "EscalationState" ADD COLUMN "hitlContext" JSONB;
