import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/config";
import type { AgentJobPayload, SimulationJobPayload } from "./jobs";

// BullMQ requires maxRetriesPerRequest to be null
const isTls = env.REDIS_URL.startsWith("rediss://");
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
});

connection.on("connect", () =>
  console.log("[Cerebro][redis] Connection: CONNECTED")
);
connection.on("ready", () => console.log("[Cerebro][redis] Connection: READY"));

/** ioredis retries forever; in dev, ECONNREFUSED spams the console — throttle to one hint. */
let lastRedisConnRefusedLogAt = 0;
connection.on("error", (err) => {
  const isRefused =
    (err as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
    (typeof err === "object" &&
      err !== null &&
      "errors" in err &&
      Array.isArray((err as AggregateError).errors) &&
      (err as AggregateError).errors.some(
        (e) => (e as NodeJS.ErrnoException).code === "ECONNREFUSED"
      ));
  if (
    env.NODE_ENV === "development" &&
    isRefused &&
    Date.now() - lastRedisConnRefusedLogAt > 60_000
  ) {
    lastRedisConnRefusedLogAt = Date.now();
    console.warn(
      "[Redis] Connection refused (nothing listening on REDIS_URL). " +
        "Start Redis, e.g. `docker compose -f docker-compose-redis.yml up -d`, " +
        "or point REDIS_URL at a running instance. Queue/dashboard polling errors will repeat until Redis is up."
    );
    return;
  }
  console.error("[Redis] Connection: ERROR", err);
});

/** Standard retry config per database.mdc §Job Retry Configuration */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
};

/**
 * The three canonical BullMQ queues per architecture.md §Queue Separation.
 *
 * - `priority` — event-driven uploads, manual dashboard triggers
 * - `scheduled` — cron-based full vault scans
 * - `simulation` — simulation batch jobs only
 */
export const queues = {
  priority: new Queue<AgentJobPayload>("cerebro-priority", {
    connection: connection as never,
    defaultJobOptions,
  }),
  scheduled: new Queue<AgentJobPayload>("cerebro-scheduled", {
    connection: connection as never,
    defaultJobOptions,
  }),
  simulation: new Queue<SimulationJobPayload>("cerebro-simulation", {
    connection: connection as never,
    defaultJobOptions,
  }),
};
