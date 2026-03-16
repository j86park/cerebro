import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const complianceStatus = await queues.compliance.getJobCounts();
    const onboardingStatus = await queues.onboarding.getJobCounts();
    const defaultStatus = await queues.default.getJobCounts();

    return NextResponse.json({
      complianceQueue: {
        waiting: complianceStatus.waiting,
        active: complianceStatus.active,
        completed: complianceStatus.completed,
        failed: complianceStatus.failed,
        delayed: complianceStatus.delayed,
      },
      onboardingQueue: {
        waiting: onboardingStatus.waiting,
        active: onboardingStatus.active,
        completed: onboardingStatus.completed,
        failed: onboardingStatus.failed,
        delayed: onboardingStatus.delayed,
      },
      defaultQueue: {
        waiting: defaultStatus.waiting,
        active: defaultStatus.active,
        completed: defaultStatus.completed,
        failed: defaultStatus.failed,
        delayed: defaultStatus.delayed,
      }
    });
  } catch (error) {
    console.error("GET /api/agents/status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue status" },
      { status: 500 }
    );
  }
}
