import { afterEach, describe, expect, test } from "bun:test";
import { POST } from "./route";

const savedUsage = process.env.USAGE_SYNC_SECRET;
const savedCron = process.env.CRON_SECRET;
afterEach(() => {
  if (savedUsage === undefined) delete process.env.USAGE_SYNC_SECRET;
  else process.env.USAGE_SYNC_SECRET = savedUsage;
  if (savedCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedCron;
});

describe("ai usage sync route", () => {
  test("refuses requests without the sync secret", async () => {
    process.env.USAGE_SYNC_SECRET = "test-usage-secret";
    for (const authorization of [
      null,
      "Bearer wrong",
      "test-usage-secret",
      "Bearer test-usage-secret-2",
      "Basic test-usage-secret",
    ]) {
      const response = await POST(
        new Request("https://example.test/api/usage/sync", {
          method: "POST",
          headers: authorization ? { authorization } : {},
          body: "{}",
        })
      );
      expect(response.status).toBe(401);
    }
  });

  test("refuses everything when no sync or cron secret is configured", async () => {
    delete process.env.USAGE_SYNC_SECRET;
    delete process.env.CRON_SECRET;
    const response = await POST(
      new Request("https://example.test/api/usage/sync", {
        method: "POST",
        headers: { authorization: "Bearer " },
        body: "{}",
      })
    );
    expect(response.status).toBe(401);
  });

  test("rejects malformed payloads when authorized", async () => {
    process.env.USAGE_SYNC_SECRET = "test-usage-secret";
    const response = await POST(
      new Request("https://example.test/api/usage/sync", {
        method: "POST",
        headers: {
          authorization: "Bearer test-usage-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ version: 2, machineId: "bad id!" }),
      })
    );
    expect(response.status).toBe(400);
  });
});
