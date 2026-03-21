import { NextResponse } from "next/server";
import { queues } from "@/lib/queue/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

type AgentsStatusPayload = {
  priorityQueue: QueueCounts;
  scheduledQueue: QueueCounts;
  simulationQueue: QueueCounts;
};

// Simple 1s in-memory cache to prevent Redis request limit hits from aggressive polling
let cachedStatus: AgentsStatusPayload | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 1000; // 1 second

/**
 * GET /api/agents/status — returns job counts for all three queues.
 */
export async function GET() {
  const now = Date.now();
  if (cachedStatus && now - lastFetchTime < CACHE_TTL) {
    return NextResponse.json({ data: cachedStatus });
  }

  try {
    const [priorityStatus, scheduledStatus, simulationStatus] =
      await Promise.all([
        queues.priority.getJobCounts(),
        queues.scheduled.getJobCounts(),
        queues.simulation.getJobCounts(),
      ]);

    const data = {
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
    };

    cachedStatus = data;
    lastFetchTime = now;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/agents/status error:", error);
    // Even on error, if we have a cache, let's return it to keep UI alive
    if (cachedStatus) {
        return NextResponse.json({ data: cachedStatus });
    }
    return NextResponse.json(
      { error: "Failed to fetch queue status" },
      { status: 500 }
    );
  }
}
