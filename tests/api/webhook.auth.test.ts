import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/document-upload/route";

vi.mock("@/lib/config", () => ({
  env: { WEBHOOK_SECRET: "my-secret", DEMO_DATE: "2026-09-16T12:00:00.000Z", DRY_RUN: true },
}));

const enqueueAgentJob = vi.fn().mockResolvedValue({
  jobId: "upload:CLT-001:doc1_ONBOARDING",
  deduplicated: false,
});

vi.mock("@/lib/queue/enqueue", () => ({
  enqueueAgentJob: (...args: unknown[]) => enqueueAgentJob(...args),
}));

vi.mock("@/lib/queue/client", () => ({
  queues: {
    priority: { add: vi.fn(), getJob: vi.fn() },
  },
}));

vi.mock("next/server", () => {
  class MockResponse {
    status: number;
    _body: unknown;
    constructor(body: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this._body = body;
    }
    json() {
      return Promise.resolve(this._body);
    }
  }
  return {
    NextResponse: {
      json: vi.fn((body, init) => new MockResponse(body, init)),
    },
  };
});

describe("Webhook Auth", () => {
  it("rejects request without webhook secret header", async () => {
    const req = new Request("http://localhost/api/webhooks/document-upload", {
      method: "POST",
      body: JSON.stringify({
        type: "INSERT",
        table: "documents",
        record: { id: "doc1", clientId: "CLT-001" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid webhook secret", async () => {
    const req = new Request("http://localhost/api/webhooks/document-upload", {
      method: "POST",
      headers: { "x-cerebro-webhook-secret": "wrong-secret" },
      body: JSON.stringify({
        type: "INSERT",
        table: "documents",
        record: { id: "doc1", clientId: "CLT-001" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts request with valid webhook secret", async () => {
    const req = new Request("http://localhost/api/webhooks/document-upload", {
      method: "POST",
      headers: { "x-cerebro-webhook-secret": "my-secret" },
      body: JSON.stringify({
        type: "INSERT",
        table: "documents",
        record: { id: "doc1", clientId: "CLT-001" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    expect(enqueueAgentJob).toHaveBeenCalled();
  });
});
