import { afterEach, describe, expect, test } from "bun:test";
import { GET } from "./route";

const saved = process.env.CRON_SECRET;
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

describe("daily cron route", () => {
  test("refuses requests without the cron secret, before any work runs", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    for (const authorization of [null, "Bearer wrong", "test-cron-secret", "Bearer test-cron-secret-2", "Basic test-cron-secret"]) {
      const response = await GET(new Request("https://example.test/api/cron/daily", { headers: authorization ? { authorization } : {} }));
      expect(response.status).toBe(401);
    }
  });

  test("refuses everything when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request("https://example.test/api/cron/daily", { headers: { authorization: "Bearer " } }));
    expect(response.status).toBe(401);
  });
});
