/**
 * Lightweight in-process counters for queue throughput (Milestone 10 observability).
 * BullMQ/ioredis introspection can wrap these later without changing call sites.
 */
type QueueMetricSnapshot = {
  priorityCompleted: number;
  priorityFailed: number;
  scheduledCompleted: number;
  scheduledFailed: number;
  simulationCompleted: number;
  simulationFailed: number;
};

const state: QueueMetricSnapshot = {
  priorityCompleted: 0,
  priorityFailed: 0,
  scheduledCompleted: 0,
  scheduledFailed: 0,
  simulationCompleted: 0,
  simulationFailed: 0,
};

export type QueueName = "cerebro-priority" | "cerebro-scheduled" | "cerebro-simulation";

/**
 * Records a successful job completion for metrics aggregation.
 */
export function recordJobCompleted(queueName: QueueName): void {
  if (queueName === "cerebro-priority") state.priorityCompleted += 1;
  else if (queueName === "cerebro-scheduled") state.scheduledCompleted += 1;
  else state.simulationCompleted += 1;
}

/**
 * Records a failed job (after final failure) for metrics aggregation.
 */
export function recordJobFailed(queueName: QueueName): void {
  if (queueName === "cerebro-priority") state.priorityFailed += 1;
  else if (queueName === "cerebro-scheduled") state.scheduledFailed += 1;
  else state.simulationFailed += 1;
}

/**
 * Returns a shallow copy of current counter values.
 */
export function getQueueMetricsSnapshot(): QueueMetricSnapshot {
  return { ...state };
}

/**
 * Resets all counters (tests only).
 */
export function resetQueueMetricsForTests(): void {
  state.priorityCompleted = 0;
  state.priorityFailed = 0;
  state.scheduledCompleted = 0;
  state.scheduledFailed = 0;
  state.simulationCompleted = 0;
  state.simulationFailed = 0;
}
