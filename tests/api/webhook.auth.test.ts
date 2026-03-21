import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/document-upload/route";

vi.mock("@/lib/config", () => ({
  env: { WEBHOOK_SECRET: "my-secret" }
}));

vi.mock("@/lib/queue/client", () => ({
  queues: {
    priority: { add: vi.fn() }
  }
}));

vi.mock("@/lib/queue/jobs", () => ({
  agentJobSchema: {
    parse: vi.fn((val) => val)
  }
}));



vi.mock("next/server", () => {
  class MockResponse {
    status: number;
    _body: any;
    constructor(body: any, init?: any) {
      this.status = init?.status ?? 200;
      this._body = body;
    }
    json() { return Promise.resolve(this._body); }
  }
  return {
    NextResponse: {
      json: vi.fn((body, init) => new MockResponse(body, init))
    }
  };
});

describe("Webhook Auth", () => {
  it("rejects request without webhook secret header", async () => {
    const req = new Request("http://localhost/api/webhooks/document-upload", {
      method: "POST",
      body: JSON.stringify({ type: "INSERT", table: "documents", record: { id: "doc1", clientId: "CLT-001" } })
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
        record: { id: "doc1", clientId: "CLT-001" }
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts request with valid webhook secret", async () => {
    const req = new Request("http://localhost/api/webhooks/document-upload", {
      method: "POST",
      headers: { "x-cerebro-webhook-secret": "my-secret" },
      body: JSON.stringify({ type: "INSERT", table: "documents", record: { id: "doc1", clientId: "CLT-001" } })
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
  });
});
