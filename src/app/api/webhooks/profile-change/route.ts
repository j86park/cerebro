import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config";
import { enqueuePkycProfileChangeEvents } from "@/lib/queue/pkycTriggers";
import { RiskProfile } from "@/lib/db/enums";

const riskProfileSchema = z.enum([
  RiskProfile.CONSERVATIVE,
  RiskProfile.MODERATE,
  RiskProfile.AGGRESSIVE,
]);

const snapshotSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  accountType: z.string().optional(),
  riskProfile: riskProfileSchema.nullable().optional(),
  onboardingStatus: z.string().optional(),
});

const profileChangeWebhookSchema = z.object({
  clientId: z.string().min(1),
  before: snapshotSchema,
  after: snapshotSchema,
});

/**
 * POST /api/webhooks/profile-change — pKYC-lite profile / risk-tier change hook.
 * Validates webhook secret, classifies material vs risk-tier deltas, and enqueues
 * deterministic BullMQ jobs (no LLM routing).
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cerebro-webhook-secret");
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const payload = profileChangeWebhookSchema.parse(body);
    const result = await enqueuePkycProfileChangeEvents(payload);

    return NextResponse.json(
      {
        data: {
          queued: result.enqueued > 0,
          enqueued: result.enqueued,
          deduplicated: result.deduplicated,
          skipped: result.skipped,
          jobIds: result.jobs.map((j) => j.jobId),
        },
      },
      { status: result.enqueued > 0 || result.deduplicated > 0 ? 202 : 200 }
    );
  } catch (err) {
    console.error("Profile-change webhook failed:", err);
    return NextResponse.json(
      { error: "Invalid profile-change webhook payload" },
      { status: 400 }
    );
  }
}
