import { createHash } from "node:crypto";
import { z } from "zod";

const hashPayloadSchema = z.object({
  scenarioId: z.string().min(1),
  toolNames: z.array(z.string()),
});

/**
 * Canonical sha256 for a trajectory fixture payload.
 * Used to detect silent edits (ReplayGate content-key miss → diverged).
 */
export function hashTrajectoryFixtureContent(
  scenarioId: string,
  toolNames: string[]
): string {
  const parsed = hashPayloadSchema.parse({ scenarioId, toolNames });
  const canonical = JSON.stringify({
    scenarioId: parsed.scenarioId,
    toolNames: parsed.toolNames,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
