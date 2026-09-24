import "server-only";
import { createGateway, experimental_evaluate, generateText, Output, type Experimental_EvaluationModel, type LanguageModel } from "ai";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cashFlows, categories, importedEntries, type ImportedEntry } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { fxToPhp } from "../calc";
import { ensureFx } from "../service";
import { AI_BATCH_SIZE, aiOutputSchema, allowedDecisions, buildCategorizePrompt, buildEvaluationQuestion, confidentChoice, deferUnmatchedBrokerTransfers, evaluationDecision, ledgerDecision, validateDecisions,
  type AiDecision, type AiExample } from "./ai-review";
import { transferSuggestions } from "./review";
import { ImportError } from "./types";

export interface AiRunResult { skipped: boolean; claimed: number; linked: number; posted: number; held: number; transfers: number; investment: number; ignored: number; unsure: number }

const STATUS_FOR = { transfer: "transfer", investment: "reviewed", ignore: "ignored" } as const;
const RUN_LIMIT = 300;
const COUNTS = ["claimed", "linked", "posted", "held", "transfers", "investment", "ignored", "unsure"] as const;

/** A language model answers a whole batch in one prompt; an evaluation model (Jev) answers one choice per entry. */
export type Classifier = { kind: "language"; model: LanguageModel } | { kind: "evaluation"; model: Experimental_EvaluationModel };

function configuredClassifier(apiKey: string): Classifier {
  const gateway = createGateway({ apiKey }), id = env.aiCategorizeModel();
  return id.startsWith("typesafe-ai/") ? { kind: "evaluation", model: gateway.evaluationModel(id) } : { kind: "language", model: gateway(id) };
}

/**
 * Categorizes pending inbox entries that rules left alone. Exact transfer pairs are linked first
 * without the model. Each remaining entry is claimed before the model call, so overlapping runs
 * (sync + import + cron) never pay twice; `retry` re-sends entries the model skipped before.
 * Posting keeps the rule path's guards: pending rows only, category kind matches the amount's sign,
 * and no same-day duplicate in cash flows.
 */
export async function categorizeWithAi({ retry = false, limit = RUN_LIMIT, model, classifier: given, entryIds, ledgerShortcut = true }: {
  retry?: boolean; limit?: number; model?: LanguageModel; classifier?: Classifier; entryIds?: string[];
  /** false sends crypto rewards and fees to the model too, instead of deciding them locally. */
  ledgerShortcut?: boolean;
} = {}): Promise<AiRunResult> {
  const result: AiRunResult = { skipped: false, claimed: 0, linked: 0, posted: 0, held: 0, transfers: 0, investment: 0, ignored: 0, unsure: 0 };
  const apiKey = env.aiGatewayApiKey();
  if (!model && !given && !apiKey) return { ...result, skipped: true };
  const classifier: Classifier = given ?? (model ? { kind: "language", model } : configuredClassifier(apiKey!));
  const db = getDb();
  result.linked = await linkExactTransfers(entryIds);
  const e = importedEntries;
  const claimable = db.select({ id: e.id }).from(e).where(and(eq(e.status, "pending"),
    // Suggest-only rules are the person's explicit "let me review these"; AI leaves them alone.
    or(isNull(e.categorizedBy), ne(e.categorizedBy, "rule")),
    retry ? undefined : isNull(e.aiAttemptedAt), entryIds ? inArray(e.id, entryIds) : undefined))
    .orderBy(asc(e.occurredOn), asc(e.id)).limit(limit).for("update", { skipLocked: true });
  const [claimed, options, examples] = await Promise.all([
    // ARRAY() evaluates the locking subquery once; `IN (subquery)` can re-run it and overshoot the limit.
    db.update(e).set({ aiAttemptedAt: new Date() }).where(sql`${e.id} = any(array(${claimable}))`).returning(),
    db.select().from(categories).where(eq(categories.archived, false)).orderBy(categories.kind, categories.sortOrder, categories.name),
    loadExamples(),
  ]);
  result.claimed = claimed.length;
  const local = (entry: ImportedEntry) => ledgerShortcut ? ledgerDecision(entry) : null;
  const ledger = claimed.flatMap((entry) => local(entry) ?? []);
  const pending = claimed.filter((entry) => !local(entry) && allowedDecisions(entry).length > 0)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));
  result.unsure += claimed.length - ledger.length - pending.length;
  if (ledger.length) {
    const applied = await applyDecisions(ledger);
    result.investment += applied.investment;
    result.unsure += applied.stale;
  }
  const batches = Array.from({ length: Math.ceil(pending.length / AI_BATCH_SIZE) }, (_, i) => pending.slice(i * AI_BATCH_SIZE, (i + 1) * AI_BATCH_SIZE));
  const settled = await Promise.allSettled(batches.map(async (batch) => {
    try {
      const { decisions, suggestions, rejected } = await decide(classifier, batch, options, examples);
      return { applied: await applyDecisions(decisions), suggested: await suggestDecisions(suggestions), rejected: rejected.length };
    } catch (error) {
      // Release the claim so the next sync or cron retries this batch (and a persistent failure surfaces as a notification).
      await db.update(e).set({ aiAttemptedAt: null }).where(and(inArray(e.id, batch.map((entry) => entry.id)), eq(e.status, "pending")));
      throw error;
    }
  }));
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    const { applied, suggested, rejected } = outcome.value;
    result.posted += applied.posted; result.held += applied.held;
    result.transfers += applied.transfers; result.investment += applied.investment; result.ignored += applied.ignored;
    result.unsure += rejected + applied.stale + suggested.kept + suggested.stale;
  }
  const failed = settled.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;
  return result;
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

/** Links the inbox's unambiguous transfer suggestions (same currency, exact opposite amounts, 7 days). */
async function linkExactTransfers(entryIds?: string[]) {
  const db = getDb();
  const candidates = await db.select().from(importedEntries).where(and(eq(importedEntries.status, "pending"),
    or(isNull(importedEntries.categorizedBy), ne(importedEntries.categorizedBy, "rule")), entryIds ? inArray(importedEntries.id, entryIds) : undefined))
    .orderBy(desc(importedEntries.occurredOn)).limit(500);
  const pairs = transferSuggestions(candidates);
  if (!pairs.length) return 0;
  const payload = pairs.flatMap(([a, b]) => { const transferId = crypto.randomUUID(); return [{ id: a.id, transfer_id: transferId }, { id: b.id, transfer_id: transferId }]; });
  const result = await db.execute(sql`
    with pairs as (select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(id uuid, transfer_id uuid)),
    locked as materialized (select e.id, e.status, p.transfer_id from imported_entries e join pairs p on p.id = e.id order by e.id for update of e),
    complete as (select transfer_id from locked group by transfer_id having count(*) filter (where status = 'pending') = 2)
    update imported_entries e set status = 'transfer', transfer_id = l.transfer_id, category_id = null, categorized_by = 'ai',
      ai_reason = 'Matched transfer between your accounts', updated_at = now()
    from locked l where e.id = l.id and l.transfer_id in (select transfer_id from complete) returning e.id`);
  return result.rows.length / 2;
}

/**
 * For sync, import and cron paths: AI trouble must never fail the work that already succeeded.
 * A first sync can bring hundreds of entries, so keep going (bounded) while runs come back full.
 */
export async function categorizeQuietly(): Promise<AiRunResult | { error: string }> {
  try {
    let last = await categorizeWithAi();
    const total = { ...last };
    for (let round = 1; round < 4 && last.claimed === RUN_LIMIT; round++) {
      last = await categorizeWithAi();
      for (const key of COUNTS) total[key] += last[key];
    }
    return total;
  } catch (error) {
    return { error: error instanceof ImportError ? error.message : "AI categorization failed." };
  }
}

async function decide(classifier: Classifier, batch: ImportedEntry[], options: typeof categories.$inferSelect[], examples: AiExample[]) {
  try {
    if (classifier.kind === "evaluation") {
      const scored = await evaluateEach(classifier.model, batch, options, examples);
      const validated = validateDecisions(batch, options, { decisions: scored.map((item) => item.output) });
      const confident = new Map(scored.map((item) => [item.output.ref, item.confident]));
      const refOf = new Map(batch.map((entry, index) => [entry.id, `e${index + 1}`]));
      const confidentDecisions = validated.decisions.filter((decision) => confident.get(refOf.get(decision.id)!) !== false);
      const unsure = validated.decisions.filter((decision) => confident.get(refOf.get(decision.id)!) === false);
      return { ...deferUnmatchedBrokerTransfers(batch, confidentDecisions, unsure), rejected: validated.rejected };
    }
    const { instructions, prompt } = buildCategorizePrompt(batch, options, examples);
    const { output } = await generateText({ model: classifier.model, instructions, prompt, temperature: 0, timeout: 60_000, maxRetries: 1,
      output: Output.object({ schema: aiOutputSchema }) });
    const validated = validateDecisions(batch, options, output);
    return { ...deferUnmatchedBrokerTransfers(batch, validated.decisions, []), rejected: validated.rejected };
  } catch (error) {
    console.error("AI categorization failed", error);
    throw new ImportError("AI categorization is unavailable right now. Entries were left in the inbox; try again later.");
  }
}

async function applyDecisions(decisions: AiDecision[]) {
  const db = getDb();
  const posts = decisions.filter((d) => d.decision === "post");
  const moves = decisions.flatMap((d) => d.decision === "post" ? [] : [{ id: d.id, status: STATUS_FOR[d.decision], reason: d.reason }]);
  const counts = { posted: 0, held: 0, transfers: 0, investment: 0, ignored: 0, stale: 0 };
  if (posts.length) {
    const currencies = await db.selectDistinct({ currency: importedEntries.currency }).from(importedEntries).where(inArray(importedEntries.id, posts.map((d) => d.id)));
    let fx: Awaited<ReturnType<typeof ensureFx>> = {};
    try { fx = await ensureFx(currencies.map((c) => c.currency)); } catch { /* Entries without a rate stay in the inbox with the AI's category. */ }
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
          and not exists (select 1 from cash_flows f where f.occurred_on = s.occurred_on and f.currency = s.currency
            and f.amount = round(abs(s.amount), 2) and f.kind::text = case when s.amount > 0 then 'income' else 'expense' end)
          and not exists (select 1 from source other where other.id <> s.id and other.occurred_on = s.occurred_on
            and other.currency = s.currency and round(abs(other.amount), 2) = round(abs(s.amount), 2) and sign(other.amount) = sign(s.amount))
        on conflict do nothing returning id
      ), updated as (
        update imported_entries e set category_id = s.target_category, categorized_by = 'ai', ai_reason = s.reason,
          status = case when exists(select 1 from posted p where p.id = e.id) then 'posted' else 'pending' end, updated_at = now()
        from source s where e.id = s.id returning e.status
      ) select count(*) filter (where status = 'posted')::int as posted, count(*) filter (where status = 'pending')::int as held from updated`);
    counts.posted = Number(result.rows[0]?.posted ?? 0);
    counts.held = Number(result.rows[0]?.held ?? 0);
    counts.stale += posts.length - counts.posted - counts.held;
  }
  if (moves.length) {
    const result = await db.execute(sql`
      with instructions as (select * from jsonb_to_recordset(${JSON.stringify(moves)}::jsonb) as x(id uuid, status text, reason text))
      update imported_entries e set status = i.status, category_id = null, categorized_by = 'ai', ai_reason = i.reason, updated_at = now()
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

/** Writes Jev's pick onto a pending row without posting it or moving it out of the inbox. */
async function suggestDecisions(decisions: AiDecision[]) {
  if (!decisions.length) return { kept: 0, stale: 0 };
  const payload = decisions.map((decision) => ({ id: decision.id, decision: decision.decision, category_id: decision.decision === "post" ? decision.categoryId : null, reason: decision.reason }));
  const result = await getDb().execute(sql`
    with instructions as (select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(id uuid, decision text, category_id integer, reason text))
    update imported_entries e set category_id = case when i.decision = 'post' then i.category_id else null end,
      categorized_by = 'ai', ai_reason = i.reason, updated_at = now()
    from instructions i where e.id = i.id and e.status = 'pending'
      and ((i.decision = 'post' and exists (select 1 from categories c where c.id = i.category_id and not c.archived
          and c.kind::text = case when e.amount > 0 then 'income' else 'expense' end))
        or (i.decision = 'transfer' and e.kind in ('payment', 'transfer', 'other'))
        or i.decision in ('investment', 'ignore'))
    returning e.id`);
  return { kept: result.rows.length, stale: decisions.length - result.rows.length };
}

/** Evaluation models take one state per call: ask every entry its own question, a few at a time. */
async function evaluateEach(model: Experimental_EvaluationModel, batch: ImportedEntry[], options: typeof categories.$inferSelect[], examples: AiExample[]) {
  const decisions: { output: ReturnType<typeof evaluationDecision>; confident: boolean }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, batch.length) }, async () => {
    while (next < batch.length) {
      const index = next++;
      const { state, instructions, criteria } = buildEvaluationQuestion(batch[index], options, examples);
      const { answers } = await experimental_evaluate({ model, state, maxRetries: 1, abortSignal: AbortSignal.timeout(30_000),
        questions: { decision: { type: "choice", instructions, criteria } } });
      const choice = String(answers.decision.choice);
      decisions.push({ output: evaluationDecision(`e${index + 1}`, choice, criteria, answers.decision.probabilities?.[choice]), confident: confidentChoice(choice, answers.decision.probabilities) });
    }
  }));
  return decisions;
}
