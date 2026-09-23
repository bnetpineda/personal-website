import { describe, expect, mock, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import type { Category, ImportedEntry } from "@/lib/db/schema";
import { allowedDecisions, buildCategorizePrompt, buildEvaluationQuestion, evaluationDecision, ledgerDecision, validateDecisions, type AiOutput } from "./ai-review";

const entry = (overrides: Partial<ImportedEntry> = {}): ImportedEntry => ({ id: crypto.randomUUID(), provider: "wise", accountKey: "personal", externalId: "CARD-1:USD:out",
  occurredOn: "2026-09-20", amount: -15, currency: "USD", kind: "payment", description: "Spotify premium", realizedPnl: null,
  status: "pending", categoryId: null, transferId: null, trade: null, categorizedBy: null, aiReason: null, aiAttemptedAt: null,
  createdAt: new Date(), updatedAt: new Date(), ...overrides });
const category = (overrides: Partial<Category> = {}): Category => ({ id: 1, kind: "expense", name: "Subscriptions", color: "#FF4D50", monthlyBudget: null,
  sortOrder: 0, archived: false, createdAt: new Date(), updatedAt: new Date(), ...overrides });
const categories = [category(), category({ id: 2, kind: "income", name: "Salary" }), category({ id: 3, name: "Old", archived: true })];
const output = (...decisions: AiOutput["decisions"]): AiOutput => ({ decisions });

describe("AI decision guardrails", () => {
  test("offers only decisions that review and posting accept", () => {
    expect(allowedDecisions(entry())).toEqual(["post", "transfer", "ignore"]);
    expect(allowedDecisions(entry({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.001 }))).toEqual(["investment", "ignore"]);
    expect(allowedDecisions(entry({ provider: "ibkr", kind: "dividend", amount: 12 }))).toEqual(["post", "investment", "ignore"]);
    expect(allowedDecisions(entry({ provider: "binance", currency: "USDT", kind: "transfer", amount: 100 }))).toEqual(["transfer", "investment", "ignore"]);
  });

  test("decides crypto rewards and fees without the model; budget-currency items still go to the model", () => {
    expect(ledgerDecision(entry({ provider: "binance", currency: "ETH", kind: "reward", amount: 0.000001 }))).toMatchObject({ decision: "investment" });
    expect(ledgerDecision(entry({ provider: "binance", currency: "USDT", kind: "fee", amount: -0.5 }))).toMatchObject({ decision: "investment" });
    expect(ledgerDecision(entry({ provider: "binance", currency: "USDT", kind: "transfer", amount: 100 }))).toBeNull();
    expect(ledgerDecision(entry({ provider: "ibkr", kind: "dividend", amount: 12 }))).toBeNull();
    expect(ledgerDecision(entry({ kind: "fee" }))).toBeNull();
  });

  test("leaves Wise spending in unsupported currencies for a person instead of ignoring it", () => {
    expect(allowedDecisions(entry({ currency: "THB" }))).toEqual([]);
    expect(allowedDecisions(entry({ currency: "THB", kind: "fee" }))).toEqual([]);
    expect(allowedDecisions(entry({ currency: "THB", kind: "transfer", amount: 900 }))).toEqual(["transfer"]);
  });

  test("accepts a category only when its kind matches the amount's direction", () => {
    const rows = [entry(), entry({ amount: 5000, description: "ACME payroll" })];
    const { decisions, rejected } = validateDecisions(rows, categories, output(
      { ref: "e1", decision: "post", categoryId: 2, reason: "wrong direction" },
      { ref: "e2", decision: "post", categoryId: 2, reason: "Monthly salary" }));
    expect(decisions).toEqual([{ id: rows[1].id, decision: "post", categoryId: 2, reason: "Monthly salary" }]);
    expect(rejected).toEqual([rows[0].id]);
  });

  test("rejects archived or unknown categories, unknown refs and repeated refs", () => {
    const rows = [entry(), entry({ description: "Netflix" })];
    const { decisions, rejected } = validateDecisions(rows, categories, output(
      { ref: "e1", decision: "post", categoryId: 3, reason: "archived" },
      { ref: "e2", decision: "post", categoryId: 99, reason: "unknown" },
      { ref: "e9", decision: "ignore", categoryId: null, reason: "no such entry" }));
    expect(decisions).toEqual([]);
    expect(rejected).toEqual(rows.map((r) => r.id));
    const twice = validateDecisions([rows[0]], categories, output(
      { ref: "e1", decision: "post", categoryId: 1, reason: "first" }, { ref: "e1", decision: "ignore", categoryId: null, reason: "second" }));
    expect(twice.decisions).toEqual([{ id: rows[0].id, decision: "post", categoryId: 1, reason: "first" }]);
  });

  test("never posts crypto units or trades, and never treats rewards as transfers", () => {
    const rows = [entry({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.001 }), entry({ provider: "ibkr", kind: "fee", amount: -1 })];
    const { decisions } = validateDecisions(rows, categories, output(
      { ref: "e1", decision: "post", categoryId: 2, reason: "crypto" }, { ref: "e2", decision: "transfer", categoryId: null, reason: "fee" }));
    expect(decisions).toEqual([]);
    expect(validateDecisions(rows, categories, output({ ref: "e1", decision: "investment", categoryId: null, reason: "  Earn\n reward " })).decisions)
      .toEqual([{ id: rows[0].id, decision: "investment", reason: "Earn reward" }]);
  });

  test("Jev questions offer only this entry's allowed answers and map back to decisions", () => {
    const expense = buildEvaluationQuestion(entry({ accountKey: "U1234567" }), categories, []);
    expect(Object.keys(expense.criteria)).toEqual(["post:1", "transfer", "ignore"]);
    expect(JSON.stringify(expense.state)).not.toContain("U1234567");
    expect(Object.keys(buildEvaluationQuestion(entry({ amount: 5000 }), categories, []).criteria)).toEqual(["post:2", "transfer", "ignore"]);
    expect(Object.keys(buildEvaluationQuestion(entry({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.1 }), categories, []).criteria)).toEqual(["investment", "ignore"]);
    expect(evaluationDecision("e1", "post:1", expense.criteria, 0.68)).toEqual({ ref: "e1", decision: "post", categoryId: 1, reason: "Jev: Subscriptions (68% likely)" });
    expect(evaluationDecision("e2", "transfer", expense.criteria)).toEqual({ ref: "e2", decision: "transfer", categoryId: null, reason: "Jev: Transfer" });
  });

  test("prompt carries no account keys, source IDs or archived categories", () => {
    const row = entry({ accountKey: "U1234567", externalId: "SECRET-REF" });
    const { prompt } = buildCategorizePrompt([row], categories, [{ description: "Spotify", provider: "wise", decision: "post: expense / Subscriptions" }]);
    expect(prompt).not.toContain("U1234567");
    expect(prompt).not.toContain("SECRET-REF");
    expect(prompt).not.toContain(row.id);
    expect(prompt).not.toContain("Old");
    expect(JSON.parse(prompt).entries[0]).toMatchObject({ ref: "e1", description: "Spotify premium", allowed: ["post", "transfer", "ignore"] });
  });
});

// Opt-in against the development DB, like database.test.ts. A mock model answers only for this test's rows.
test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("AI decisions post, move and hold entries atomically", async () => {
  mock.module("server-only", () => ({}));
  const { getDb } = await import("@/lib/db");
  const { categorizeWithAi } = await import("./ai-service");
  const { cashFlows, categories: categoryTable, importedEntries } = await import("@/lib/db/schema");
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`;
  let categoryId: number | undefined, ids: string[] = [];
  try {
    const [created] = await db.insert(categoryTable).values({ name: scope, color: "#112233", kind: "expense" }).returning();
    categoryId = created.id;
    const rows = await db.insert(importedEntries).values([
      { provider: "wise", accountKey: scope, externalId: "AI-1", occurredOn: "2001-02-01", kind: "payment", amount: -12.5, currency: "PHP", description: `${scope} coffee` },
      { provider: "wise", accountKey: scope, externalId: "AI-2", occurredOn: "2001-02-02", kind: "transfer", amount: 500, currency: "PHP", description: `${scope} top-up` },
      { provider: "binance", accountKey: scope, externalId: "AI-3", occurredOn: "2001-02-03", kind: "reward", amount: 0.0001, currency: "BTC", description: `${scope} earn` },
      { provider: "wise", accountKey: scope, externalId: "AI-4", occurredOn: "2001-02-04", kind: "payment", amount: -3, currency: "PHP", description: `${scope} unsure` },
      { provider: "wise", accountKey: scope, externalId: "AI-5", occurredOn: "2001-02-05", kind: "transfer", amount: -700, currency: "PHP", description: `${scope} out` },
      { provider: "ibkr", accountKey: scope, externalId: "AI-6", occurredOn: "2001-02-06", kind: "transfer", amount: 700, currency: "PHP", description: `${scope} in` },
      { provider: "wise", accountKey: scope, externalId: "AI-7", occurredOn: "2001-02-07", kind: "payment", amount: -9, currency: "PHP", description: `${scope} coffee`, categorizedBy: "rule" },
    ]).returning();
    ids = rows.map((r) => r.id);
    let calls = 0;
    const answers: Record<string, object> = { coffee: { decision: "post", categoryId }, "top-up": { decision: "transfer", categoryId: null }, earn: { decision: "investment", categoryId: null } };
    const model = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const text = prompt.flatMap((m) => m.role === "user" ? m.content : []).map((p) => p.type === "text" ? p.text : "").join("");
      const { entries } = JSON.parse(text) as { entries: { ref: string; description: string }[] };
      const decisions = entries.flatMap((e) => { const answer = answers[e.description.split(" ").pop()!]; return answer ? [{ ref: e.ref, reason: "test", ...answer }] : []; });
      return { content: [{ type: "text", text: JSON.stringify({ decisions }) }], finishReason: { unified: "stop", raw: undefined }, warnings: [],
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } } };
    } });
    // Two overlapping runs (say, sync and import) claim disjoint rows: the model is called once.
    const [result, overlap] = await Promise.all([categorizeWithAi({ model, entryIds: ids }), categorizeWithAi({ model, entryIds: ids })]);
    expect(calls).toBe(1);
    expect({ ...result, linked: result.linked + overlap.linked }).toMatchObject({ linked: 1, posted: 1, transfers: 1, investment: 1, unsure: 1 });
    const saved = new Map((await db.select().from(importedEntries).where(inArray(importedEntries.id, ids))).map((r) => [r.externalId, r]));
    expect(saved.get("AI-1")).toMatchObject({ status: "posted", categoryId, categorizedBy: "ai" });
    expect(saved.get("AI-2")).toMatchObject({ status: "transfer", categorizedBy: "ai" });
    expect(saved.get("AI-3")).toMatchObject({ status: "reviewed", categorizedBy: "ai" });
    expect(saved.get("AI-4")).toMatchObject({ status: "pending", categorizedBy: null });
    expect(saved.get("AI-4")!.aiAttemptedAt).not.toBeNull();
    expect(saved.get("AI-5")!.transferId).toBe(saved.get("AI-6")!.transferId);
    expect(saved.get("AI-5")).toMatchObject({ status: "transfer", categorizedBy: "ai" });
    // A suggest-only rule is the person's call; AI never touches it.
    expect(saved.get("AI-7")).toMatchObject({ status: "pending", categorizedBy: "rule", aiAttemptedAt: null });
    // Unattempted-only runs skip what the model has already seen.
    expect(await categorizeWithAi({ model, entryIds: ids })).toMatchObject({ posted: 0, unsure: 0 });
    expect(calls).toBe(1);
    // A failed model call releases its claim so the next run retries.
    const broken = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("gateway down"); } });
    await expect(categorizeWithAi({ model: broken, entryIds: ids, retry: true })).rejects.toThrow("AI categorization is unavailable");
    const [after] = await db.select().from(importedEntries).where(eq(importedEntries.id, saved.get("AI-4")!.id));
    expect(after.aiAttemptedAt).toBeNull();
  } finally {
    if (ids.length) await db.delete(cashFlows).where(inArray(cashFlows.id, ids));
    if (ids.length) await db.delete(importedEntries).where(inArray(importedEntries.id, ids));
    if (categoryId) await db.delete(categoryTable).where(eq(categoryTable.id, categoryId));
  }
});
