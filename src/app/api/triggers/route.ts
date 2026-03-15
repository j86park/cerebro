import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";
import { defaultJobSchema, complianceJobSchema, onboardingJobSchema } from "@/lib/queue/jobs";
import { z } from "zod";

const triggerRequestSchema = z.object({
  queueName: z.enum(["compliance", "onboarding", "default"]),
  payload: z.any(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { queueName, payload } = triggerRequestSchema.parse(body);

    if (queueName === "compliance") {
      const parsed = complianceJobSchema.parse(payload);
      await queues.compliance.add(`manual-${parsed.clientId}-${Date.now()}`, parsed);
    } else if (queueName === "onboarding") {
      const parsed = onboardingJobSchema.parse(payload);
      await queues.onboarding.add(`manual-${parsed.clientId}-${Date.now()}`, parsed);
    } else {
      const parsed = defaultJobSchema.parse(payload);
      await queues.default.add(`manual-${parsed.clientId}-${Date.now()}`, parsed);
    }

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (err) {
    console.error("Manual trigger failed:", err);
    return NextResponse.json({ error: "Invalid trigger payload" }, { status: 400 });
  }
}
