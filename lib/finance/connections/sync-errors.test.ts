import { describe, expect, test } from "bun:test";
import { connectionStatus, needsNewCredentials, plainSyncError, untriedAccounts } from "./types";

describe("sync errors in everyday words", () => {
  test("a client error says what to do, without the status code", () => {
    const message = plainSyncError("Binance", "The account provider returned HTTP 400. Try again later.");
    expect(message).toContain("Reconnect");
    expect(message).not.toMatch(/HTTP|400|provider/);
  });

  test("a server error doesn't send anyone to replace a working key", () => {
    const message = plainSyncError("IBKR", "The account provider returned HTTP 503. Try again later.");
    expect(message).toMatch(/try again later/i);
    expect(message).not.toContain("Reconnect");
  });

  test("only a rejected key needs new credentials; an outage just needs another try", () => {
    expect(needsNewCredentials("The account provider returned HTTP 400. Try again later.")).toBe(true);
    expect(needsNewCredentials("Account access was denied. Check the credential.")).toBe(true);
    expect(needsNewCredentials("The account provider returned HTTP 503. Try again later.")).toBe(false);
    expect(needsNewCredentials("The provider rate limit was reached.")).toBe(false);
  });

  test("an account's state has one name wherever it shows", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const fresh = { provider: "binance" as const, enabled: true, error: null, historyError: null, snapshot: { asOf: "2026-11-05T00:00:00Z" }, lastSyncedAt: new Date("2026-11-05T06:00:00Z") };
    expect(connectionStatus(fresh, now)).toEqual({ label: "Up to date", attention: false });
    expect(connectionStatus({ ...fresh, error: "x" }, now)).toEqual({ label: "Sync failed", attention: true });
    expect(connectionStatus({ ...fresh, historyError: "x" }, now)).toEqual({ label: "History failed", attention: true });
    expect(connectionStatus({ ...fresh, lastSyncedAt: new Date("2026-10-01T00:00:00Z") }, now)).toEqual({ label: "Out of date", attention: true });
    expect(connectionStatus({ ...fresh, enabled: false, error: "x" }, now)).toEqual({ label: "Paused", attention: false });
  });

  test("an enabled account nothing has tried in days means the daily job isn't running", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const account = { enabled: true, lastAttemptAt: new Date("2026-10-04T00:00:00Z"), lastSyncedAt: new Date("2026-09-23T00:00:00Z") };
    expect(untriedAccounts([account], now)).toHaveLength(1);
    expect(untriedAccounts([{ ...account, lastAttemptAt: new Date("2026-11-04T22:00:00Z") }], now)).toHaveLength(0);
    expect(untriedAccounts([{ ...account, enabled: false }], now)).toHaveLength(0);
    // Never tried at all is a new connection, not a stuck job.
    expect(untriedAccounts([{ ...account, lastAttemptAt: null, lastSyncedAt: null }], now)).toHaveLength(0);
  });

  test("other messages keep their content and name the account", () => {
    expect(plainSyncError("Binance", "The provider rate limit was reached. Wait a few minutes and retry.")).toBe("Binance rate limit was reached. Wait a few minutes and retry.");
    expect(plainSyncError("IBKR", "Add a history Flex Query ID.")).toBe("Add a history Flex Query ID.");
  });
});
