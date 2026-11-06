import "server-only";
import { createHash } from "node:crypto";
import { createGateway, generateText, Output } from "ai";
import { and, asc, count, desc, eq, gte, inArray, lt, max, sql, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections, aiSummaries, cashFlows, categories, categoryBudgets, goals, importedEntries, liabilities, netWorthSnapshots, recurringCashFlows } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { buildSummaryFacts, buildSummaryPrompt, financeSummarySchema, hashableFacts, readSummary, tidySummary, type FinanceSummary, type SummaryFacts } from "./ai-summary";
import { monthlySeries } from "./calc";
import { isConnectionStale, PROVIDER_META } from "./connections/types";
import { dashboardMonth } from "./dashboard";
import { addMonths, currentMonth, monthLabel, monthRange, todayManila } from "./dates";
import { averageMonthlySpending, goalProgress } from "./goals";
import { missingStatementProviders, statementCoverage } from "./imports/coverage";
import { currentNetWorth, loadFxTable } from "./service";

/*
 * The Overview's AI feedback. No auth check here: the cron route (CRON_SECRET) and a Server Action
 * (requireAdmin first) share it. Only the totals in buildSummaryFacts are sent to the AI Gateway.
 */

/** Older summaries are only kept as a short trail. */
const KEEP = 30;

export type SummaryRun =
  | { status: "written"; summary: FinanceSummary }
  | { status: "unchanged" }
  | { status: "unconfigured" };

/** Everything the facts are built from, straight from the database. */
export async function loadSummaryFacts(now = new Date()): Promise<SummaryFacts> {
  const db = getDb();
  const today = todayManila(now), current = currentMonth(now);
  const from = monthRange(addMonths(current, -12)).start, to = monthRange(current).end;
  const month = sql<string>`to_char(${cashFlows.occurredOn}, 'YYYY-MM')`;
  const e = importedEntries;
  const [nw, fx, snapshots, debts, monthly, byCategory, allCategories, overrides, recurring, goalRows, connections, statementRows] = await Promise.all([
    currentNetWorth(),
    loadFxTable(),
    db.select({ date: netWorthSnapshots.snapshotDate, netWorth: netWorthSnapshots.netWorthPhp }).from(netWorthSnapshots).orderBy(asc(netWorthSnapshots.snapshotDate)),
    db.select().from(liabilities).where(eq(liabilities.archived, false)),
    db.select({ month, kind: cashFlows.kind, total: sum(cashFlows.amountPhp).mapWith(Number) }).from(cashFlows)
      .where(and(gte(cashFlows.occurredOn, from), lt(cashFlows.occurredOn, to))).groupBy(month, cashFlows.kind),
    db.select({ categoryId: cashFlows.categoryId, month, total: sum(cashFlows.amountPhp).mapWith(Number) }).from(cashFlows)
      .where(and(eq(cashFlows.kind, "expense"), gte(cashFlows.occurredOn, from), lt(cashFlows.occurredOn, to))).groupBy(cashFlows.categoryId, month),
    db.select().from(categories),
    db.select({ categoryId: categoryBudgets.categoryId, amount: categoryBudgets.amount }).from(categoryBudgets).where(eq(categoryBudgets.month, current)),
    db.select().from(recurringCashFlows),
    db.select().from(goals).where(eq(goals.archived, false)).orderBy(asc(goals.sortOrder)),
    db.select({ provider: accountConnections.provider, enabled: accountConnections.enabled, error: accountConnections.error, lastSyncedAt: accountConnections.lastSyncedAt,
      includeInNetWorth: accountConnections.includeInNetWorth, asOf: sql<string | null>`${accountConnections.snapshot}->>'asOf'` }).from(accountConnections),
    db.select({ provider: e.provider, month: sql<string>`to_char(${e.occurredOn}, 'YYYY-MM')`, entries: count(), importedAt: max(e.createdAt) })
      .from(e).where(inArray(e.provider, ["wise", "maribank"])).groupBy(e.provider, sql`2`),
  ]);

  const statements = statementCoverage(statementRows);
  const months = monthlySeries(current, 13, monthly.map((r) => ({ month: r.month, kind: r.kind, total: r.total ?? 0 })))
    .map((p) => ({ month: p.month, ...pick(dashboardMonth(p, statements, current)) }));
  const spending = averageMonthlySpending(months.filter((m) => m.month < current).slice(-6).map((m) => ({ expense: m.expense, incomplete: m.incomplete })));
  const cash = nw.empty ? null : (nw.byClass.cash ?? 0);
  const figures = { netWorth: nw.empty ? null : nw.netWorthPhp, cash, investments: nw.empty ? null : nw.assetsPhp - (nw.byClass.cash ?? 0), monthlySpending: spending };

  const gaps = [
    ...connections.filter((c) => c.enabled && c.includeInNetWorth && (c.error || isConnectionStale({ ...c, snapshot: c.asOf ? { asOf: c.asOf } : null }, now)))
      .map((c) => `${PROVIDER_META[c.provider].name} balances are out of date, so net worth may be off.`),
    ...missingStatementProviders(statements, addMonths(current, -1))
      .map((p) => `${PROVIDER_META[p].name} statements don't reach ${monthLabel(addMonths(current, -1))}, so recent income and spending are incomplete.`),
    ...(nw.missingFx.length ? [`No exchange rate for ${nw.missingFx.join(", ")}; those amounts are left out.`] : []),
  ];

  return buildSummaryFacts({
    today,
    current,
    fx,
    netWorth: nw,
    snapshots,
    debts,
    months,
    categorySpending: byCategory.map((r) => ({ categoryId: r.categoryId, month: r.month, total: r.total ?? 0 })),
    categories: allCategories,
    monthBudgets: new Map(overrides.map((o) => [o.categoryId, o.amount])),
    recurring,
    goals: goalRows.map((g) => ({ name: g.name, measure: g.measure, targetOn: g.targetOn, progress: goalProgress(g, figures, today) })),
    emergencyMonths: cash != null && spending ? cash / spending : null,
    gaps,
  });
}

const pick = (m: ReturnType<typeof dashboardMonth>) => ({ income: m.income, expense: m.expense, incomplete: m.incomplete });

export const factsHash = (facts: SummaryFacts) => createHash("sha256").update(JSON.stringify(hashableFacts(facts))).digest("hex").slice(0, 32);

/**
 * Writes a new summary. Unless `force`, it skips when the numbers haven't changed since the latest one,
 * so the daily run only pays when there's something new to say.
 */
export async function writeAiSummary({ force = false }: { force?: boolean } = {}): Promise<SummaryRun> {
  const apiKey = env.aiGatewayApiKey();
  if (!apiKey) return { status: "unconfigured" };
  const db = getDb();
  const facts = await loadSummaryFacts();
  const inputHash = factsHash(facts);
  if (!force) {
    const [latest] = await db.select({ inputHash: aiSummaries.inputHash }).from(aiSummaries).orderBy(desc(aiSummaries.createdAt)).limit(1);
    if (latest?.inputHash === inputHash) return { status: "unchanged" };
  }
  const modelId = env.aiSummaryModel();
  const { instructions, prompt } = buildSummaryPrompt(facts);
  const { output } = await generateText({
    model: createGateway({ apiKey })(modelId),
    instructions,
    prompt,
    timeout: 60_000,
    maxRetries: 1,
    output: Output.object({ schema: financeSummarySchema }),
  });
  const summary = tidySummary(output);
  await db.insert(aiSummaries).values({ model: modelId, inputHash, summary });
  await db.execute(sql`delete from ${aiSummaries} where ${aiSummaries.id} not in (select id from ${aiSummaries} order by created_at desc limit ${KEEP})`);
  return { status: "written", summary };
}

/** For the daily cron: AI trouble must never fail the run. */
export async function writeAiSummaryQuietly(): Promise<SummaryRun["status"] | "failed"> {
  try {
    return (await writeAiSummary()).status;
  } catch (error) {
    console.error("[admin] AI summary failed", error);
    return "failed";
  }
}

/** The latest summary in today's shape; an older, longer one reads as none until it's written again. */
export async function latestAiSummary() {
  const [row] = await getDb().select().from(aiSummaries).orderBy(desc(aiSummaries.createdAt)).limit(1);
  const summary = row ? readSummary(row.summary) : null;
  return row && summary ? { ...row, summary } : null;
}
