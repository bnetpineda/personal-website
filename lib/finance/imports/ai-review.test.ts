import type { Experimental_EvaluationModel } from "ai";
import { describe, expect, mock, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import type { Category, ImportedEntry } from "@/lib/db/schema";
import { allowedDecisions, buildCategorizePrompt, buildEvaluationQuestion, evaluationDecision, learnedPayees, ledgerDecision, relevantExamples, rememberedDecision, routineDecision, settleEvaluation, unconvertibleDecision, validateDecisions, type AiOutput } from "./ai-review";

const entry = (overrides: Partial<ImportedEntry> = {}): ImportedEntry => ({ id: crypto.randomUUID(), provider: "wise", accountKey: "personal", externalId: "CARD-1:USD:out",
  occurredOn: "2026-09-20", amount: -15, currency: "USD", kind: "payment", description: "Spotify premium", realizedPnl: null,
  status: "pending", categoryId: null, transferId: null, trade: null, categorizedBy: null, aiReason: null, aiSuggestion: null, aiAttemptedAt: null,
  createdAt: new Date(), updatedAt: new Date(), ...overrides });
const category = (overrides: Partial<Category> = {}): Category => ({ id: 1, kind: "expense", name: "Subscriptions", color: "#FF4D50", monthlyBudget: null,
  sortOrder: 0, archived: false, createdAt: new Date(), updatedAt: new Date(), ...overrides });
const categories = [category(), category({ id: 2, kind: "income", name: "Salary" }), category({ id: 3, name: "Old", archived: true })];
const output = (...decisions: AiOutput["decisions"]): AiOutput => ({ decisions });

describe("learning from the person's choices", () => {
  const book = [...categories, category({ id: 8, kind: "expense", name: "Shopping" }), category({ id: 9, kind: "income", name: "Freelance" })];
  const examples = [
    { description: "Card Payment: Grok Xai", provider: "maribank", decision: "post: expense / Subscriptions" },
    { description: "Received from Romer Martin LLC", provider: "wise", decision: "post: income / Freelance" },
    { description: "Payment: Shopee", provider: "maribank", decision: "post: expense / Shopping" },
    { description: "Payment: Shopee", provider: "maribank", decision: "post: expense / Subscriptions" },
  ];

  test("a payee decided the same way every time is filed without the model", () => {
    expect(rememberedDecision(entry({ description: "Card payment: Grok Xai (38.00 USD)", amount: -2000, currency: "PHP" }), examples, book))
      .toMatchObject({ decision: "post", categoryId: 1, reason: "Same as your earlier choice for Grok Xai" });
    // Wise's older wording and an invoice number still match the same payee.
    expect(rememberedDecision(entry({ description: "Received money from Romer Martin LLC with reference 806096", amount: 1000, currency: "PHP" }), examples, book))
      .toMatchObject({ decision: "post", categoryId: 9 });
  });

  test("mixed past choices, the wrong direction and unknown payees go to the model", () => {
    expect(rememberedDecision(entry({ description: "Payment: Shopee", currency: "PHP" }), examples, book)).toBeNull();
    expect(rememberedDecision(entry({ description: "Card Payment: Grok Xai", amount: 50, currency: "PHP" }), examples, book)).toBeNull();
    expect(rememberedDecision(entry({ description: "Card Payment: Brand New Shop", currency: "PHP" }), examples, book)).toBeNull();
  });

  test("the model sees the same payee first and each category with the person's own merchants", () => {
    expect(relevantExamples(entry({ description: "Card payment: Grok Xai" }), examples, 2)[0].description).toBe("Card Payment: Grok Xai");
    expect(learnedPayees(examples, book).get("post:expense:Subscriptions")).toEqual(["Grok Xai", "Shopee"]);
    const question = buildEvaluationQuestion(entry({ currency: "PHP" }), book, examples);
    expect(question.criteria["post:expense:Subscriptions"]).toContain("This person's own examples: Grok Xai, Shopee.");
  });
});

describe("AI decision guardrails", () => {
  test("offers only decisions that review and posting accept", () => {
    expect(allowedDecisions(entry())).toEqual(["post", "transfer", "ignore"]);
    expect(allowedDecisions(entry({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.001 }))).toEqual(["investment", "ignore"]);
    expect(allowedDecisions(entry({ provider: "ibkr", kind: "dividend", amount: 12 }))).toEqual(["post", "ignore"]);
    expect(allowedDecisions(entry({ provider: "binance", currency: "USDT", kind: "transfer", amount: 100 }))).toEqual(["transfer", "investment", "ignore"]);
  });

  test("decides crypto rewards and fees without the model; budget-currency items still go to the model", () => {
    expect(ledgerDecision(entry({ provider: "binance", currency: "ETH", kind: "reward", amount: 0.000001 }))).toMatchObject({ decision: "investment" });
    expect(ledgerDecision(entry({ provider: "binance", currency: "USDT", kind: "fee", amount: -0.5 }))).toMatchObject({ decision: "investment" });
    expect(ledgerDecision(entry({ provider: "binance", currency: "USDT", kind: "transfer", amount: 100 }))).toBeNull();
    expect(ledgerDecision(entry({ provider: "ibkr", kind: "dividend", amount: 12 }))).toBeNull();
    expect(ledgerDecision(entry({ kind: "fee" }))).toBeNull();
  });

  test("files Wise activity in unsupported currencies without the model", () => {
    expect(allowedDecisions(entry({ currency: "THB" }))).toEqual(["ignore"]);
    expect(allowedDecisions(entry({ currency: "THB", kind: "fee" }))).toEqual(["ignore"]);
    expect(allowedDecisions(entry({ currency: "THB", kind: "transfer", amount: 900 }))).toEqual(["transfer"]);
    expect(unconvertibleDecision(entry({ currency: "THB" }))).toMatchObject({ decision: "ignore" });
    expect(unconvertibleDecision(entry({ currency: "THB", kind: "transfer", amount: 900 }))).toMatchObject({ decision: "transfer" });
    expect(unconvertibleDecision(entry())).toBeNull();
    expect(unconvertibleDecision(entry({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.1 }))).toBeNull();
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

  test("posts budget-currency dividends, interest, fees and tax, and keeps the ledger for the rest", () => {
    for (const kind of ["dividend", "interest", "fee", "tax"] as const) {
      const row = entry({ provider: "ibkr", kind, amount: kind === "fee" || kind === "tax" ? -2 : 12 });
      expect(allowedDecisions(row)).toEqual(["post", "ignore"]);
      expect(validateDecisions([row], categories, output({ ref: "e1", decision: "investment", categoryId: null, reason: "ledger" })).decisions).toEqual([]);
    }
    expect(allowedDecisions(entry({ provider: "ibkr", currency: "THB", kind: "dividend", amount: 12 }))).toEqual(["investment", "ignore"]);
    expect(Object.keys(buildEvaluationQuestion(entry({ provider: "ibkr", kind: "dividend", amount: 12 }), categories, []).criteria)).toEqual(["post:income:Salary", "ignore"]);
  });

  test("decides card checks, self transfers, broker cash and exchange deposits without the model", () => {
    const holder = "Mark Bennett Pineda";
    const book = [...categories, category({ id: 4, kind: "expense", name: "Fees & charges" }), category({ id: 5, kind: "expense", name: "Taxes" }),
      category({ id: 6, kind: "income", name: "Investment income" }), category({ id: 7, kind: "expense", name: "Other" })];
    expect(routineDecision(entry({ description: "Card transaction of 1.00 PHP issued by Shopee Ph" }), book, holder)).toMatchObject({ decision: "ignore" });
    expect(routineDecision(entry({ description: "Card transaction of 33,641.00 PHP issued by Shopee Ph" }), book, holder)).toBeNull();
    expect(routineDecision(entry({ kind: "transfer", amount: -49960, description: "Sent money to Mark Bennett Naval Pineda" }), book, holder)).toMatchObject({ decision: "transfer" });
    expect(routineDecision(entry({ amount: 56028, description: "Received money from Centauri Media Ltd with reference" }), book, holder)).toBeNull();
    expect(routineDecision(entry({ provider: "wise", kind: "fee", amount: -39.2, description: "Wise Charges for: TRANSFER-1" }), book, holder)).toMatchObject({ decision: "post", categoryId: 4 });
    expect(routineDecision(entry({ provider: "ibkr", kind: "dividend", amount: 12, description: "AAPL dividend" }), book, holder)).toMatchObject({ decision: "post", categoryId: 6 });
    expect(routineDecision(entry({ provider: "ibkr", kind: "tax", amount: -2, description: "Withholding" }), book, holder)).toMatchObject({ decision: "post", categoryId: 5 });
    expect(routineDecision(entry({ provider: "binance", currency: "SOL", kind: "transfer", amount: -1.6, description: "Binance withdraw · SOL" }), book, holder)).toMatchObject({ decision: "transfer" });
    expect(routineDecision(entry({ provider: "ibkr", currency: "THB", kind: "dividend", amount: 12 }), book, holder)).toBeNull();
  });

  test("Jev questions name options in words and keep past decisions on those same options", () => {
    const expense = buildEvaluationQuestion(entry({ accountKey: "U1234567" }), categories, [
      { description: "Spotify", provider: "wise", decision: "post: expense / Subscriptions" },
      { description: "Payroll", provider: "wise", decision: "post: income / Salary" },
    ], "Mark Bennett Pineda");
    expect(Object.keys(expense.criteria)).toEqual(["post:expense:Subscriptions", "transfer", "ignore"]);
    expect(expense.criteria["post:expense:Subscriptions"]).toContain("hosting");
    expect(expense.state.accountHolder).toBe("Mark Bennett Pineda");
    expect(JSON.stringify(expense.state)).not.toContain("U1234567");
    expect(expense.state.pastDecisionsByThisPerson).toEqual([{ description: "Spotify", provider: "wise", decision: "post:expense:Subscriptions" }]);
    expect(Object.keys(buildEvaluationQuestion(entry({ amount: 5000 }), categories, []).criteria)).toEqual(["post:income:Salary", "transfer", "ignore"]);
    expect(Object.keys(buildEvaluationQuestion(entry({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.1 }), categories, []).criteria)).toEqual(["investment", "ignore"]);
    expect(evaluationDecision("e1", "post:expense:Subscriptions", categories, 0.68)).toEqual({ ref: "e1", decision: "post", categoryId: 1, reason: "Jev: Subscriptions (68% likely)" });
    expect(evaluationDecision("e2", "transfer", categories)).toEqual({ ref: "e2", decision: "transfer", categoryId: null, reason: "Jev: Transfer" });
  });

  test("a close Jev category lands on Other and a clear one is filed", () => {
    const book = [...categories, category({ id: 7, kind: "expense", name: "Other" })];
    const unsure = settleEvaluation("e1", "post:expense:Subscriptions", book, -15, { "post:expense:Subscriptions": 0.54, ignore: 0.46 });
    expect(unsure).toEqual({ ref: "e1", decision: "post", categoryId: 7, reason: "Jev: Other, closest Subscriptions (54% likely)" });
    const split = settleEvaluation("e2", "post:expense:Subscriptions", book, -15, { "post:expense:Subscriptions": 0.85, "post:expense:Other": 0.7 });
    expect(split.categoryId).toBe(7);
    const sure = settleEvaluation("e3", "post:expense:Subscriptions", book, -15, { "post:expense:Subscriptions": 0.96, ignore: 0.04 });
    expect(sure).toMatchObject({ decision: "post", categoryId: 1 });
    expect(settleEvaluation("e4", "transfer", book, -15, { transfer: 0.44, "post:expense:Subscriptions": 0.4 }).decision).toBe("transfer");
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
    expect({ ...result, linked: result.linked + overlap.linked }).toMatchObject({ linked: 1, posted: 2, transfers: 1, investment: 1, unsure: 1 });
    const saved = new Map((await db.select().from(importedEntries).where(inArray(importedEntries.id, ids))).map((r) => [r.externalId, r]));
    expect(saved.get("AI-1")).toMatchObject({ status: "posted", categoryId, categorizedBy: "ai" });
    expect(saved.get("AI-2")).toMatchObject({ status: "transfer", categorizedBy: "ai" });
    expect(saved.get("AI-3")).toMatchObject({ status: "reviewed", categorizedBy: "ai" });
    expect(saved.get("AI-4")).toMatchObject({ status: "pending", categorizedBy: null });
    expect(saved.get("AI-4")!.aiAttemptedAt).not.toBeNull();
    expect(saved.get("AI-5")!.transferId).toBe(saved.get("AI-6")!.transferId);
    expect(saved.get("AI-5")).toMatchObject({ status: "transfer", categorizedBy: "ai" });
    // Suggest-only rule matches are no longer held back: AI files them like everything else.
    expect(saved.get("AI-7")).toMatchObject({ status: "posted", categoryId, categorizedBy: "ai" });
    // Runs skip what the model saw within the last hour.
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

test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("a clear Jev choice is filed, a close one goes to Other, a logged twin is not posted twice, and another import is not a twin", async () => {
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
      { provider: "wise", accountKey: scope, externalId: "SURE", occurredOn: "2001-03-01", kind: "payment", amount: -12, currency: "PHP", description: `${scope} confident` },
      { provider: "wise", accountKey: scope, externalId: "CLOSE", occurredOn: "2001-03-02", kind: "payment", amount: -8, currency: "PHP", description: `${scope} unsure` },
      { provider: "wise", accountKey: scope, externalId: "TWIN", occurredOn: "2001-03-03", kind: "payment", amount: -5, currency: "PHP", description: `${scope} recurring` },
      { provider: "maribank", accountKey: scope, externalId: "SEPARATE", occurredOn: "2001-03-04", kind: "payment", amount: -7, currency: "PHP", description: `${scope} second bank` },
    ]).returning();
    await db.insert(cashFlows).values({ kind: "expense", occurredOn: "2001-03-03", amount: 5, currency: "PHP", amountPhp: 5, categoryId, description: `${scope} logged` });
    // Already filed from the first bank: the same date and amount from the second bank is separate money.
    const [filed] = await db.insert(importedEntries).values({ provider: "wise", accountKey: scope, externalId: "FILED", occurredOn: "2001-03-04", kind: "payment",
      amount: -7, currency: "PHP", description: `${scope} first bank`, status: "posted", categoryId, categorizedBy: "rule" }).returning();
    await db.insert(cashFlows).values({ id: filed.id, kind: "expense", occurredOn: "2001-03-04", amount: 7, currency: "PHP", amountPhp: 7, categoryId, description: `${scope} first bank` });
    ids = rows.map((row) => row.id);
    const model = {
      specificationVersion: "v4" as const, provider: "test", modelId: "jev-test", supportedQuestionTypes: ["choice" as const],
      async doEvaluate({ state, questions }: { state: { transaction: { description: string } }; questions: { decision: { criteria: Record<string, string> } } }) {
        const choice = `post:expense:${scope}`;
        const close = state.transaction.description.endsWith("unsure");
        const probabilities = Object.fromEntries(Object.keys(questions.decision.criteria).map((key) => [key, 0]));
        probabilities[choice] = close ? 0.54 : 0.96;
        probabilities.ignore = close ? 0.46 : 0.04;
        return { answers: { decision: { type: "choice" as const, choice, probabilities } }, warnings: [] };
      },
    };
    const result = await categorizeWithAi({ classifier: { kind: "evaluation", model: model as unknown as Experimental_EvaluationModel }, entryIds: ids });
    const [other] = await db.select().from(categoryTable).where(and(eq(categoryTable.kind, "expense"), eq(categoryTable.name, "Other"), eq(categoryTable.archived, false)));
    expect(result).toMatchObject({ posted: 3, duplicates: 1, unsure: 0, held: 0 });
    const saved = new Map((await db.select().from(importedEntries).where(inArray(importedEntries.id, ids))).map((row) => [row.externalId, row]));
    expect(saved.get("SURE")).toMatchObject({ status: "posted", categoryId, categorizedBy: "ai" });
    expect(saved.get("CLOSE")).toMatchObject({ status: "posted", categoryId: other.id, categorizedBy: "ai", aiSuggestion: null });
    expect(saved.get("CLOSE")!.aiReason).toContain("Other");
    expect(saved.get("CLOSE")!.aiReason).toContain("54% likely");
    expect(saved.get("TWIN")).toMatchObject({ status: "ignored", categoryId: null, categorizedBy: "ai" });
    expect(saved.get("TWIN")!.aiReason).toStartWith("Already in Transactions");
    expect(await db.select().from(cashFlows).where(eq(cashFlows.id, saved.get("TWIN")!.id))).toHaveLength(0);
    expect(saved.get("SEPARATE")).toMatchObject({ status: "posted", categoryId });
  } finally {
    const filed = await db.select({ id: importedEntries.id }).from(importedEntries).where(eq(importedEntries.accountKey, scope));
    ids = [...new Set([...ids, ...filed.map((row) => row.id)])];
    if (ids.length) await db.delete(cashFlows).where(inArray(cashFlows.id, ids));
    await db.delete(cashFlows).where(eq(cashFlows.description, `${scope} logged`));
    if (ids.length) await db.delete(importedEntries).where(inArray(importedEntries.id, ids));
    if (categoryId) await db.delete(categoryTable).where(eq(categoryTable.id, categoryId));
  }
});
