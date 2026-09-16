/**
 * One-time / manual seed: inserts PromptVersion rows and staging/production pointers.
 *
 * Run: node --env-file=.env.local --import tsx prisma/seeds/seed-prompt-versions.ts
 */
import { PrismaClient } from "@prisma/client";
import { COMPLIANCE_SYSTEM_PROMPT } from "../../src/agents/compliance/prompts";
import { ONBOARDING_SYSTEM_PROMPT } from "../../src/agents/onboarding/prompts";

const prisma = new PrismaClient();

async function seedAgent(agentId: string, content: string): Promise<void> {
  await prisma.promptVersion.updateMany({
    where: { agentId },
    data: { isActive: false },
  });
  const version = await prisma.promptVersion.create({
    data: {
      agentId,
      content,
      isActive: true,
      mutationReason: "initial_seed",
    },
  });

  // REGULATORY: seed both env pointers to the same immutable version; promote/rollback move pointers only.
  for (const environment of ["STAGING", "PRODUCTION"] as const) {
    await prisma.promptEnvironmentPointer.upsert({
      where: {
        agentId_environment: { agentId, environment },
      },
      create: {
        agentId,
        environment,
        promptVersionId: version.id,
        previousPromptVersionId: null,
      },
      update: {
        promptVersionId: version.id,
        previousPromptVersionId: null,
      },
    });
  }
}

async function main(): Promise<void> {
  await seedAgent("compliance", COMPLIANCE_SYSTEM_PROMPT);
  await seedAgent("onboarding", ONBOARDING_SYSTEM_PROMPT);
  console.log(
    "PromptVersion + staging/production pointers seeded for compliance + onboarding.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
