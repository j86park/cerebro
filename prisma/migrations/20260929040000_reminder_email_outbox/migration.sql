CREATE TABLE "ReminderEmailOutbox" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReminderEmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderEmailOutbox_idempotencyKey_key" ON "ReminderEmailOutbox"("idempotencyKey");
CREATE INDEX "ReminderEmailOutbox_status_lockedAt_idx" ON "ReminderEmailOutbox"("status", "lockedAt");
