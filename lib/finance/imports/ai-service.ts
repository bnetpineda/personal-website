import "server-only";
import { createGateway, experimental_evaluate, generateText, Output, type Experimental_EvaluationModel, type LanguageModel } from "ai";
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cashFlows, categories, importedEntries, type ImportedEntry } from "@/lib/db/schema";
import { SITE } from "@/lib/constants";
import { env } from "@/lib/env";
import { fxToPhp } from "../calc";
import { ensureFx } from "../service";
import { AI_BATCH_SIZE, aiOutputSchema, buildCategorizePrompt, buildEvaluationQuestion, ledgerDecision, routineDecision, settleEvaluation, unconvertibleDecision, validateDecisions,
  type AiDecision, type AiExample } from "./ai-review";
import { transferSuggestions } from "./review";
import { ImportError } from "./types";

export interface AiRunResult { skipped: boolean; claimed: number; linked: number; posted: number; duplicates: number; held: number; transfers: number; investment: number; ignored: number; unsure: number }

const STATUS_FOR = { transfer: "transfer", investment: "reviewed", ignore: "ignored" } as const;
const RUN_LIMIT = 300;
const COUNTS = ["claimed", "linked", "posted", "duplicates", "held", "transfers", "investment", "ignored", "unsure"] as const;

/** A language model answers a whole batch in one prompt; an evaluation model (Jev) answers one choice per entry. */
export type Classifier = { kind: "language"; model: LanguageModel } | { kind: "evaluation"; model: Experimental_EvaluationModel };

function configuredClassifier(apiKey: string): Classifier {
  const gateway = createGateway({ apiKey }), id = env.aiCategorizeModel();
  return id.startsWith("typesafe-ai/") ? { kind: "evaluation", model: gateway.evaluationModel(id) } : { kind: "language", model: gateway(id) };
}

/**
 * Files every pending entry that rules did not post. Exact transfer pairs are linked first without
 * the model; everything else takes the model's answer as final. Each entry is claimed before the
 * model call, so overlapping runs (sync + import + cron) never pay twice. An entry still pending an
 * hour after its claim (no exchange rate yet, or an answer that failed validation) is asked again;
 * `retry` asks again right away. Posting keeps the rule path's guards: pending rows only and
 * category kind matches the amount's sign; a same-day twin the person logged (by hand or from a schedule) is ignored instead.
 */
export async function categorizeWithAi({ retry = false, limit = RUN_LIMIT, model, classifier: given, entryIds, ledgerShortcut = true }: {
  retry?: boolean; limit?: number; model?: LanguageModel; classifier?: Classifier; entryIds?: string[];
  /** false sends crypto rewards and fees to the model too, instead of deciding them locally. */
  ledgerShortcut?: boolean;
} = {}): Promise<AiRunResult> {
  const result: AiRunResult = { skipped: false, claimed: 0, linked: 0, posted: 0, duplicates: 0, held: 0, transfers: 0, investment: 0, ignored: 0, unsure: 0 };
  const apiKey = env.aiGatewayApiKey();
  if (!model && !given && !apiKey) return { ...result, skipped: true };
  const classifier: Classifier = given ?? (model ? { kind: "language", model } : configuredClassifier(apiKey!));
  const db = getDb();
  result.linked = await linkExactTransfers(entryIds);
  const e = importedEntries;
  const claimable = db.select({ id: e.id }).from(e).where(and(eq(e.status, "pending"),
    retry ? undefined : or(isNull(e.aiAttemptedAt), lt(e.aiAttemptedAt, sql`now() - interval '1 hour'`)), entryIds ? inArray(e.id, entryIds) : undefined))
    .orderBy(asc(e.occurredOn), asc(e.id)).limit(limit).for("update", { skipLocked: true });
  const [claimed, options, examples] = await Promise.all([
    // ARRAY() evaluates the locking subquery once; `IN (subquery)` can re-run it and overshoot the limit.
    db.update(e).set({ aiAttemptedAt: new Date() }).where(sql`${e.id} = any(array(${claimable}))`).returning(),
    db.select().from(categories).where(eq(categories.archived, false)).orderBy(categories.kind, categories.sortOrder, categories.name),
    loadExamples(),
  ]);
  result.claimed = claimed.length;
  const local = (entry: ImportedEntry) => unconvertibleDecision(entry) ?? (ledgerShortcut ? ledgerDecision(entry) : null) ?? routineDecision(entry, options, SITE.name);
  const decided = claimed.flatMap((entry) => local(entry) ?? []);
  const pending = claimed.filter((entry) => !local(entry))
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));
  if (decided.length) addApplied(result, await applyDecisions(decided));
  const batches = Array.from({ length: Math.ceil(pending.length / AI_BATCH_SIZE) }, (_, i) => pending.slice(i * AI_BATCH_SIZE, (i + 1) * AI_BATCH_SIZE));
  const settled = await Promise.allSettled(batches.map(async (batch) => {
    try {
      const { decisions, rejected } = await decide(classifier, batch, options, examples);
      return { applied: await applyDecisions(decisions), rejected: rejected.length };
    } catch (error) {
      // Release the claim so the next sync or cron retries this batch (and a persistent failure surfaces as a notification).
      await db.update(e).set({ aiAttemptedAt: null }).where(and(inArray(e.id, batch.map((entry) => entry.id)), eq(e.status, "pending")));
      throw error;
    }
  }));
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    addApplied(result, outcome.value.applied);
    result.unsure += outcome.value.rejected;
  }
  const failed = settled.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;
  return result;
}

function addApplied(result: AiRunResult, applied: Awaited<ReturnType<typeof applyDecisions>>) {
  result.posted += applied.posted; result.duplicates += applied.duplicates; result.held += applied.held;
  result.transfers += applied.transfers; result.investment += applied.investment; result.ignored += applied.ignored;
  result.unsure += applied.stale;
}

/** The person's own decisions teach the model their habits. Unedited AI answers are never fed back. */
async function loadExamples(): Promise<AiExample[]> {
  const db = getDb(), e = importedEntries;
  const [posted, moved] = await Promise.all([
    // Rule and manual posts, plus AI posts the person re-categorized in Transactions.
    db.select({ description: e.description, provider: e.provider, kind: categories.kind, category: categories.name })
      .from(e).innerJoin(cashFlows, eq(cashFlows.id, e.id)).innerJoin(categories, eq(categories.id, cashFlows.categoryId))
      .where(and(eq(e.status, "posted"), or(isNull(e.categorizedBy), ne(e.categorizedBy, "ai"), ne(cashFlows.categoryId, e.categoryId))))
      .orderBy(desc(cashFlows.updatedAt)).limit(60),
    db.select({ description: e.description, provider: e.provider, status: e.status }).from(e)
      .where(and(eq(e.categorizedBy, "manual"), inArray(e.status, ["transfer", "reviewed", "ignored"])))
      .orderBy(desc(e.updatedAt)).limit(20),
  ]);
  const decisionFor = { transfer: "transfer", reviewed: "investment", ignored: "ignore" } as const;
  return [...posted.map((p) => ({ description: p.description, provider: p.provider, decision: `post: ${p.kind} / ${p.category}` })),
    ...moved.map((m) => ({ description: m.description, provider: m.provider, decision: decisionFor[m.status as keyof typeof decisionFor] }))];
}

/** Links unambiguous transfer pairs between your accounts (same currency, exact opposite amounts, 7 days). */
async function linkExactTransfers(entryIds?: string[]) {
  const db = getDb();
  const candidates = await db.select().from(importedEntries).where(and(eq(importedEntries.status, "pending"), entryIds ? inArray(importedEntries.id, entryIds) : undefined))
    .orderBy(desc(importedEntries.occurredOn)).limit(500);
  const pairs = transferSuggestions(candidates);
  if (!pairs.length) return 0;
  const payload = pairs.flatMap(([a, b]) => { const transferId = crypto.randomUUID(); return [{ id: a.id, transfer_id: transferId }, { id: b.id, transfer_id: transferId }]; });
  const result = await db.execute(sql`
    with pairs as (select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(id uuid, transfer_id uuid)),
    locked as materialized (select e.id, e.status, p.transfer_id from imported_entries e join pairs p on p.id = e.id order by e.id for update of e),
    complete as (select transfer_id from locked group by transfer_id having count(*) filter (where status = 'pending') = 2)
    update imported_entries e set status = 'transfer', transfer_id = l.transfer_id, category_id = null, categorized_by = 'ai',
      ai_reason = 'Matched transfer between your accounts', ai_suggestion = null, updated_at = now()
    from locked l where e.id = l.id and l.transfer_id in (select transfer_id from complete) returning e.id`);
  return result.rows.length / 2;
}

/**
 * For sync, import and cron paths: AI trouble must never fail the work that already succeeded.
 * A first sync can bring hundreds of entries, so keep going (bounded by rounds and time) while
 * runs come back full. Whatever is left waits for the next sync or the daily cron.
 */
export async function categorizeQuietly({ budgetMs = 150_000 }: { budgetMs?: number } = {}): Promise<AiRunResult | { error: string }> {
  const deadline = Date.now() + budgetMs;
  try {
    let last = await categorizeWithAi();
    const total = { ...last };
    for (let round = 1; round < 4 && last.claimed === RUN_LIMIT && Date.now() < deadline; round++) {
      last = await categorizeWithAi();
      for (const key of COUNTS) total[key] += last[key];
    }
    return total;
  } catch (error) {
    return { error: error instanceof ImportError ? error.message : "AI categorization failed." };
  }
}

/** The tail of an import or sync message: what the model filed just now. */
export function describeAiRun(run: AiRunResult | { error: string }): string {
  if ("error" in run) return ` ${run.error}`;
  if (run.skipped) return " Add AI_GATEWAY_API_KEY to categorize new activity automatically.";
  const parts = ([["posted", run.posted], ["transfers", run.transfers + run.linked * 2], ["investment", run.investment],
    ["ignored", run.ignored], ["already in Transactions", run.duplicates]] as const).filter(([, n]) => n > 0).map(([label, n]) => `${n} ${label}`);
  const waiting = run.held + run.unsure;
  if (!parts.length && !waiting) return "";
  return ` Categorized: ${parts.join(", ") || "nothing yet"}.${waiting ? ` ${waiting} will be retried on the next sync.` : ""}`;
}

async function decide(classifier: Classifier, batch: ImportedEntry[], options: typeof categories.$inferSelect[], examples: AiExample[]) {
  try {
    if (classifier.kind === "evaluation") return validateDecisions(batch, options, { decisions: await evaluateEach(classifier.model, batch, options, examples) });
    const { instructions, prompt } = buildCategorizePrompt(batch, options, examples);
    const { output } = await generateText({ model: classifier.model, instructions, prompt, temperature: 0, timeout: 60_000, maxRetries: 1,
      output: Output.object({ schema: aiOutputSchema }) });
    return validateDecisions(batch, options, output);
  } catch (error) {
    console.error("AI categorization failed", error);
    throw new ImportError("AI categorization is unavailable right now. New activity stays uncategorized and is retried on the next sync.");
  }
}

async function applyDecisions(decisions: AiDecision[]) {
  const db = getDb();
  const posts = decisions.filter((d) => d.decision === "post");
  const moves = decisions.flatMap((d) => d.decision === "post" ? [] : [{ id: d.id, status: STATUS_FOR[d.decision], reason: d.reason }]);
  const counts = { posted: 0, duplicates: 0, held: 0, transfers: 0, investment: 0, ignored: 0, stale: 0 };
  if (posts.length) {
    const currencies = await db.selectDistinct({ currency: importedEntries.currency }).from(importedEntries).where(inArray(importedEntries.id, posts.map((d) => d.id)));
    let fx: Awaited<ReturnType<typeof ensureFx>> = {};
    try { fx = await ensureFx(currencies.map((c) => c.currency)); } catch { /* Entries without a rate stay pending and are asked again later. */ }
    const rates = new Map(currencies.map((c) => [c.currency, fxToPhp(fx, c.currency)]));
    const payload = posts.map((d) => ({ id: d.id, category_id: d.categoryId, reason: d.reason }));
    const result = await db.execute(sql`
      with instructions as (select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(id uuid, category_id integer, reason text)),
      rates as (select * from jsonb_to_recordset(${JSON.stringify([...rates].map(([currency, rate]) => ({ currency, rate })))}::jsonb) as r(currency text, rate numeric)),
      source as materialized (
        select e.*, i.category_id as target_category, i.reason, r.rate from imported_entries e
        join instructions i on e.id = i.id
        join categories c on c.id = i.category_id and not c.archived and c.kind::text = case when e.amount > 0 then 'income' else 'expense' end
        left join rates r on r.currency = e.currency
        where e.status = 'pending' order by e.id for update of e
      ), posted as (
        insert into cash_flows (id, kind, occurred_on, amount, currency, amount_php, category_id, description, account, notes)
        select s.id, (case when s.amount > 0 then 'income' else 'expense' end)::cash_flow_kind,
          s.occurred_on, round(abs(s.amount), 2), s.currency, round(abs(s.amount) * s.rate, 2), s.target_category,
          s.description, upper(s.provider), 'Categorized by AI: ' || s.reason
        from source s where s.rate > 0
          and round(abs(s.amount) * s.rate, 2) < 1000000000000
          -- Only an entry the person logged (by hand or from a schedule) is a twin; other imports are separate money.
          and not exists (select 1 from cash_flows f where f.occurred_on = s.occurred_on and f.currency = s.currency
            and f.amount = round(abs(s.amount), 2) and f.kind::text = case when s.amount > 0 then 'income' else 'expense' end and not exists (select 1 from imported_entries i where i.id = f.id))
        on conflict do nothing returning id
      ), outcome as (
        -- Priced but not posted means the same amount is already logged that day (a recurring or manual entry).
        select s.id, s.target_category, s.reason, case when exists(select 1 from posted p where p.id = s.id) then 'posted'
          when s.rate > 0 then 'ignored' else 'pending' end as status from source s
      ), updated as (
        update imported_entries e set category_id = case when o.status = 'ignored' then null else o.target_category end, categorized_by = 'ai',
          ai_reason = case when o.status = 'ignored' then 'Already in Transactions: ' || o.reason else o.reason end,
          ai_suggestion = null, status = o.status, updated_at = now()
        from outcome o where e.id = o.id returning e.status
      ) select count(*) filter (where status = 'posted')::int as posted, count(*) filter (where status = 'ignored')::int as duplicates,
        count(*) filter (where status = 'pending')::int as held from updated`);
    counts.posted = Number(result.rows[0]?.posted ?? 0);
    counts.duplicates = Number(result.rows[0]?.duplicates ?? 0);
    counts.held = Number(result.rows[0]?.held ?? 0);
    counts.stale += posts.length - counts.posted - counts.duplicates - counts.held;
  }
  if (moves.length) {
    const result = await db.execute(sql`
      with instructions as (select * from jsonb_to_recordset(${JSON.stringify(moves)}::jsonb) as x(id uuid, status text, reason text))
      update imported_entries e set status = i.status, category_id = null, categorized_by = 'ai', ai_reason = i.reason, ai_suggestion = null, updated_at = now()
      from instructions i where e.id = i.id and e.status = 'pending'
        and (i.status <> 'transfer' or e.kind in ('payment', 'transfer', 'other'))
      returning e.status`);
    for (const row of result.rows) {
      if (row.status === "transfer") counts.transfers++;
      else if (row.status === "reviewed") counts.investment++;
      else counts.ignored++;
    }
    counts.stale += moves.length - result.rows.length;
  }
  return counts;
}

/** Evaluation models take one state per call: ask every entry its own question, a few at a time. */
async function evaluateEach(model: Experimental_EvaluationModel, batch: ImportedEntry[], options: typeof categories.$inferSelect[], examples: AiExample[]) {
  const decisions: ReturnType<typeof settleEvaluation>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, batch.length) }, async () => {
    while (next < batch.length) {
      const index = next++;
      const { state, instructions, criteria } = buildEvaluationQuestion(batch[index], options, examples);
      const { answers } = await experimental_evaluate({ model, state, maxRetries: 1, abortSignal: AbortSignal.timeout(30_000),
        questions: { decision: { type: "choice", instructions, criteria } } });
      const choice = String(answers.decision.choice);
      decisions.push(settleEvaluation(`e${index + 1}`, choice, options, batch[index].amount, answers.decision.probabilities));
    }
  }));
  return decisions;
}
