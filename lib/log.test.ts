import { describe, expect, test } from "bun:test";
import { describeError, logError, redactMessage } from "./log";

describe("describeError", () => {
  test("drops a Drizzle query's SQL and parameters, keeps the driver's code", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "cash_flows_pkey"'), { code: "23505", constraint: "cash_flows_pkey" });
    const error = Object.assign(new Error("Failed query: insert into cash_flows (amount, note) values ($1, $2)\nparams: 1500.00,Lunch with Ana"), { name: "DrizzleQueryError", cause });
    const logged = describeError(error);
    expect(logged).toEqual({ name: "DrizzleQueryError", message: "Failed query: duplicate key value violates unique constraint …", code: "23505", constraint: "cash_flows_pkey" });
    expect(JSON.stringify(logged)).not.toContain("Lunch");
    expect(JSON.stringify(logged)).not.toContain("1500");
  });

  test("never copies an AI SDK error's request body", () => {
    const error = Object.assign(new Error("Bad Request"), { name: "AI_APICallError", statusCode: 400, requestBodyValues: { prompt: "Net worth ₱1,234,567. Payee: Juan Dela Cruz" }, responseBody: "{}" });
    const logged = describeError(error);
    expect(logged).toEqual({ name: "AI_APICallError", message: "Bad Request", status: 400 });
    expect(JSON.stringify(logged)).not.toContain("Juan");
  });

  test("masks quoted values, amounts, key details and emails in a message", () => {
    expect(redactMessage('invalid input syntax for type numeric: "12abc"')).toBe("invalid input syntax for type numeric: …");
    expect(redactMessage("Key (id)=(5f1c-…) already exists. Paid 12,500.75 to x")).toBe("Key (…)=(…) already exists. Paid # to x");
    expect(redactMessage("mail owner@example.com failed")).toBe("mail … failed");
    expect(redactMessage("first line\nsecond line with secrets")).toBe("first line");
    expect(redactMessage("x".repeat(500)).length).toBeLessThanOrEqual(121);
  });

  test("handles non-errors and ignores long or odd codes", () => {
    expect(describeError("plain text 12345")).toEqual({ name: "string", message: "plain text #" });
    expect(describeError(null)).toEqual({ name: "object", message: "" });
    expect(describeError({ name: "X", message: "m", code: "a code with spaces that could be anything" })).toEqual({ name: "X", message: "m" });
  });

  test("logError prints only the summary", () => {
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => { calls.push(args); };
    try {
      logError("restore failed", Object.assign(new Error("Failed query: select 1\nparams: secret"), { name: "DrizzleQueryError" }));
      logError("no detail");
    } finally {
      console.error = original;
    }
    expect(calls).toEqual([["[admin] restore failed", { name: "DrizzleQueryError", message: "Failed query" }], ["[admin] no detail"]]);
  });
});
