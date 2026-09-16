import { createHash, randomBytes } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import {
  Observability,
  DefaultExporter,
  SensitiveDataFilter,
  SamplingStrategyType,
} from "@mastra/observability";
import type { TracingOptions } from "@mastra/core/observability";
import { env } from "@/lib/config";
import { z } from "zod";

const jobTraceTagsSchema = z.object({
  clientId: z.string().min(1),
  agentName: z.string().min(1),
  stage: z.number().int(),
  jobId: z.string().min(1),
});

export type JobTraceTags = z.infer<typeof jobTraceTagsSchema>;

/**
 * Returns whether GenAI span content (prompts/completions) may be captured.
 * Default off; never enabled in production even if TRACE_CONTENT_CAPTURE is set.
 */
export function shouldCaptureTraceContent(): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.TRACE_CONTENT_CAPTURE === true;
}

/**
 * Derives a stable 32-char hex trace id for one BullMQ job (one logical GenAI trace).
 */
export function buildJobTraceId(jobId: string): string {
  return createHash("sha256")
    .update(`cerebro-job:${jobId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Builds a fresh random 32-char hex id when no job id is available (tests / ad-hoc).
 */
export function buildRandomTraceId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Creates Mastra Observability with storage-backed DefaultExporter + redaction.
 * OTLP exporters are intentionally omitted unless OTEL_EXPORTER_OTLP_ENDPOINT is set
 * (credentials/endpoint ownership is a stop/escalate gate — Postgres decisions remain SoR).
 */
export function createCerebroObservability(): Observability | undefined {
  if (!env.MASTRA_TRACING_ENABLED) {
    return undefined;
  }

  // REGULATORY: SensitiveDataFilter redacts tokens/secrets from exported spans by default.
  return new Observability({
    configs: {
      default: {
        serviceName: "cerebro",
        sampling: { type: SamplingStrategyType.ALWAYS },
        requestContextKeys: ["clientId", "agentName", "stage", "jobId"],
        exporters: [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  });
}

/**
 * Builds RequestContext + tracingOptions tagged with client/agent/stage/job for one worker run.
 */
export function buildJobTracingContext(raw: JobTraceTags): {
  requestContext: RequestContext;
  tracingOptions: TracingOptions;
  traceId: string;
  contentCaptured: boolean;
} {
  const tags = jobTraceTagsSchema.parse(raw);
  const traceId = buildJobTraceId(tags.jobId);
  const contentCaptured = shouldCaptureTraceContent();

  const requestContext = new RequestContext();
  requestContext.set("clientId", tags.clientId);
  requestContext.set("agentName", tags.agentName);
  requestContext.set("stage", tags.stage);
  requestContext.set("jobId", tags.jobId);

  const tracingOptions: TracingOptions = {
    traceId,
    metadata: {
      clientId: tags.clientId,
      agentName: tags.agentName,
      stage: tags.stage,
      jobId: tags.jobId,
    },
    tags: [
      `client:${tags.clientId}`,
      `agent:${tags.agentName}`,
      `stage:${tags.stage}`,
      `job:${tags.jobId}`,
    ],
    hideInput: !contentCaptured,
    hideOutput: !contentCaptured,
  };

  return { requestContext, tracingOptions, traceId, contentCaptured };
}
