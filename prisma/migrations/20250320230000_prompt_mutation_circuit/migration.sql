-- CreateTable
CREATE TABLE "PromptMutationCircuitState" (
    "id" TEXT NOT NULL,
    "consecutiveRejections" INTEGER NOT NULL DEFAULT 0,
    "lastEnqueueAt" TIMESTAMP(3),
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptMutationCircuitState_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PromptMutationCircuitState" ("id", "consecutiveRejections", "updatedAt")
VALUES ('singleton', 0, CURRENT_TIMESTAMP);
