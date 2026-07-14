import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-frontier-routes";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

const { registerRoutes } = await import("../routes");

test("frontier endpoint returns the validated registry and summary", async () => {
  const app = express();
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/frontier-models`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      asOf: string;
      summary: { modelCount: number; labCount: number };
      models: Array<{ id: string }>;
    };
    assert.equal(body.asOf, "2026-07-14");
    assert.equal(body.summary.modelCount, body.models.length);
    assert.ok(body.summary.labCount >= 10);
    assert.ok(body.models.some((model) => model.id === "gpt-5-6-sol"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
