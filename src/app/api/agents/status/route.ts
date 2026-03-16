import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/agents/status — returns job counts for all three queues.
 */
export async function GET() {
  try {
    const [priorityStatus, scheduledStatus, simulationStatus] =
      await Promise.all([
        queues.priority.getJobCounts(),
        queues.scheduled.getJobCounts(),
        queues.simulation.getJobCounts(),
      ]);

    return NextResponse.json({
      data: {
        priorityQueue: {
          waiting: priorityStatus.waiting,
          active: priorityStatus.active,
          completed: priorityStatus.completed,
          failed: priorityStatus.failed,
          delayed: priorityStatus.delayed,
        },
        scheduledQueue: {
          waiting: scheduledStatus.waiting,
          active: scheduledStatus.active,
          completed: scheduledStatus.completed,
          failed: scheduledStatus.failed,
          delayed: scheduledStatus.delayed,
        },
        simulationQueue: {
          waiting: simulationStatus.waiting,
          active: simulationStatus.active,
          completed: simulationStatus.completed,
          failed: simulationStatus.failed,
          delayed: simulationStatus.delayed,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/agents/status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue status" },
      { status: 500 }
    );
  }
}
