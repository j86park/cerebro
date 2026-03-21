import type { PromptLesson } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/**
 * Loads recent validated lessons for prompt injection (no pgvector until extension is enabled).
 */
export async function getRelevantLessons(agentId: string): Promise<PromptLesson[]> {
  return prisma.promptLesson.findMany({
    where: {
      agentId,
      passedGate: true,
      regressionCount: { lt: 3 },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
}

/**
 * Appends a numbered guard-rail block when lessons exist.
 */
export function injectLessons(basePrompt: string, lessons: PromptLesson[]): string {
  if (lessons.length === 0) return basePrompt;

  const lines = lessons.map(
    (l, i) => `${i + 1}. [${l.failureType}] ${l.lessonText}`
  );
  return `${basePrompt.trimEnd()}\n\n## Guard rails\n${lines.join("\n")}\n`;
}
