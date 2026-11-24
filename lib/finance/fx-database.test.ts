import { expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { phpRatesOn } = await import("./service");
import { fxRateHistory } from "@/lib/db/schema";

// Opt-in: the development DB plus Frankfurter's public rates. Only adds rows to the rate cache.
test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("an old entry converts at its own date's rate and the rate is saved", async () => {
  const rateOf = await phpRatesOn([{ currency: "USD", on: "2024-03-04" }, { currency: "PHP", on: "2024-03-04" }], "2026-11-20");
  const then = rateOf("USD", "2024-03-04");
  expect(then).toBeGreaterThan(50);
  expect(rateOf("PHP", "2024-03-04")).toBe(1);
  const saved = await getDb().select().from(fxRateHistory).where(and(eq(fxRateHistory.currency, "USD"), eq(fxRateHistory.on, "2024-03-04")));
  expect(saved[0]?.rateToPhp).toBe(then!);
  const recent = (await phpRatesOn([{ currency: "USD", on: "2026-11-19" }], "2026-11-20"))("USD", "2026-11-19");
  expect(recent).toBeGreaterThan(50);
  expect(recent).not.toBe(then);
}, 60_000);
