/** Stages source prompt revisions without changing the production pointer. */
import { prisma } from "@/lib/db/client";
import { setEnvironmentPointer } from "@/lib/prompt-ops";
import { COMPLIANCE_SYSTEM_PROMPT } from "@/agents/compliance/prompts";
import { ONBOARDING_SYSTEM_PROMPT } from "@/agents/onboarding/prompts";

async function main() {
  for (const [agentId, content] of [
    ["compliance", COMPLIANCE_SYSTEM_PROMPT],
    ["onboarding", ONBOARDING_SYSTEM_PROMPT],
  ] as const) {
    const production = await prisma.promptEnvironmentPointer.findUnique({
      where: { agentId_environment: { agentId, environment: "PRODUCTION" } },
    });
    let version = await prisma.promptVersion.findFirst({
      where: { agentId, content },
      orderBy: { createdAt: "desc" },
    });
    if (!version) {
      version = await prisma.promptVersion.create({
        data: {
          agentId,
          content,
          parentVersionId: production?.promptVersionId,
          mutationReason: "agent-workflow-remediation",
          isActive: false,
        },
      });
    }
    await setEnvironmentPointer({ agentId, environment: "STAGING", promptVersionId: version.id });
    console.log(`${agentId}: staged ${version.id}; production unchanged`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
