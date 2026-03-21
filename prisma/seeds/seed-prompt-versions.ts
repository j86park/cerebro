/**
 * One-time / manual seed: inserts active PromptVersion rows from hardcoded prompts.
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
  await prisma.promptVersion.create({
    data: {
      agentId,
      content,
      isActive: true,
      mutationReason: "initial_seed",
    },
  });
}

async function main(): Promise<void> {
  await seedAgent("compliance", COMPLIANCE_SYSTEM_PROMPT);
  await seedAgent("onboarding", ONBOARDING_SYSTEM_PROMPT);
  console.log("PromptVersion seed complete for compliance + onboarding.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
