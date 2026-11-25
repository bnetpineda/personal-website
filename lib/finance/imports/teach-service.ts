import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { autoTaughtPayees, cashFlows, categories, categoryRules, importedEntries, type AutoTaughtEntry } from "@/lib/db/schema";
import type { CashFlowKind } from "../constants";
import { payeeKey } from "../payee";
import { autoTeachPicks, teachGroups, type AutoTaughtRow } from "./teach";

/*
 * Teach once, by the person or by the daily job. Either way one category is saved as a rule for the
 * payee and its past AI-filed payments move to it. The daily job only does it for payees the model
 * keeps guessing the same way (autoTeachPicks), and keeps what it changed so Undo can put it back.
 */

/** Imported entries the model filed under Other, for the Teach list and for auto-sorting. */
export async function loadUnsureEntries() {
  const e = importedEntries;
  return getDb()
    .select({ description: e.description, kind: cashFlows.kind, amountPhp: cashFlows.amountPhp, occurredOn: cashFlows.occurredOn, aiReason: e.aiReason })
    .from(e).innerJoin(cashFlows, eq(cashFlows.id, e.id)).innerJoin(categories, eq(categories.id, cashFlows.categoryId))
    .where(and(eq(e.status, "posted"), eq(e.categorizedBy, "ai"), eq(categories.name, "Other"), eq(e.categoryId, cashFlows.categoryId)))
    .limit(2000);
}

export type TeachResult = { ok: true; message: string; moved: number } | { ok: false; message: string };

/**
 * Saves the rule and re-files the payee's past AI-filed entries of that kind; manual and rule
 * decisions are left alone. `auto` records the previous state for Undo, in the same transaction.
 */
export async function teachPayeeNow(payee: string, kind: CashFlowKind, categoryId: number, { auto = false } = {}): Promise<TeachResult> {
  const db = getDb();
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!category || category.archived || category.kind !== kind) return { ok: false, message: "Choose an active category matching income or expense." };
  const key = payeeKey(payee);
  const e = importedEntries;
  const candidates = await db.select({ id: e.id, description: e.description, categoryId: cashFlows.categoryId, notes: cashFlows.notes,
    importCategoryId: e.categoryId, categorizedBy: e.categorizedBy, aiReason: e.aiReason })
    .from(e).innerJoin(cashFlows, eq(cashFlows.id, e.id))
    .where(and(eq(e.status, "posted"), eq(e.categorizedBy, "ai"), eq(cashFlows.kind, kind))).limit(5000);
  const moving = candidates.filter((c) => payeeKey(c.description) === key);
  const ids = moving.map((c) => c.id);
  const [existing] = await db.select().from(categoryRules)
    .where(and(sql`lower(${categoryRules.contains}) = lower(${payee})`, eq(categoryRules.kind, kind)));
  const ruleId = existing?.id ?? crypto.randomUUID();
  const now = new Date();
  // One batch is one transaction: the rule, the re-filed entries and the undo record land together.
  const rule = existing
    ? db.update(categoryRules).set({ categoryId: category.id, enabled: true, autoPost: true, updatedAt: now }).where(eq(categoryRules.id, existing.id))
    : db.insert(categoryRules).values({ id: ruleId, contains: payee, provider: null, kind, categoryId: category.id, autoPost: true });
  const note = auto ? `Sorted automatically: ${payee} is ${category.name}.` : `Taught once: ${payee} is ${category.name}.`;
  const record = db.insert(autoTaughtPayees).values({
    payee, payeeKey: key, kind, categoryId: category.id, ruleId,
    ruleBefore: existing ? { categoryId: existing.categoryId, enabled: existing.enabled, autoPost: existing.autoPost } : null,
    entriesBefore: moving.map(({ id, categoryId, notes, importCategoryId, categorizedBy, aiReason }): AutoTaughtEntry => ({ id, categoryId, notes, importCategoryId, categorizedBy, aiReason })),
  });
  const moves = ids.length ? [
    db.update(cashFlows).set({ categoryId: category.id, notes: note, updatedAt: now }).where(inArray(cashFlows.id, ids)),
    db.update(e).set({ categoryId: category.id, categorizedBy: "rule", aiReason: null, updatedAt: now }).where(inArray(e.id, ids)),
  ] as const : [] as const;
  if (auto) await db.batch([rule, record, ...moves]);
  else if (moves.length) await db.batch([rule, ...moves]);
  else await rule;
  return { ok: true, moved: ids.length, message: `${payee} is ${category.name} from now on. Moved ${ids.length} past ${ids.length === 1 ? "entry" : "entries"}.` };
}

/** Daily: sorts every payee the model keeps guessing the same way. Payees the person un-did are skipped. */
export async function autoTeachPayees() {
  const db = getDb();
  const [entries, options, declined] = await Promise.all([
    loadUnsureEntries(),
    db.select({ id: categories.id, name: categories.name, kind: categories.kind, archived: categories.archived }).from(categories),
    db.select({ key: autoTaughtPayees.payeeKey, kind: autoTaughtPayees.kind }).from(autoTaughtPayees).where(isNotNull(autoTaughtPayees.undoneAt)),
  ]);
  const picks = autoTeachPicks(teachGroups(entries), options, new Set(declined.map((d) => `${d.key}|${d.kind}`)));
  let payees = 0, moved = 0;
  for (const { group, category } of picks) {
    const result = await teachPayeeNow(group.payee, group.kind, category.id, { auto: true });
    if (result.ok) { payees++; moved += result.moved; }
  }
  return { payees, moved };
}

/** Auto-sorted payees from the last two weeks that can still be undone, newest first. */
export async function recentAutoTaught(): Promise<AutoTaughtRow[]> {
  const t = autoTaughtPayees;
  return getDb().select({ id: t.id, payee: t.payee, category: categories.name, entries: sql<number>`jsonb_array_length(${t.entriesBefore})`.mapWith(Number), createdAt: t.createdAt })
    .from(t).innerJoin(categories, eq(categories.id, t.categoryId))
    .where(and(isNull(t.undoneAt), gte(t.createdAt, sql`now() - interval '14 days'`)))
    .orderBy(desc(t.createdAt)).limit(20);
}

/**
 * Puts an auto-sorted payee back: its entries return to Other with the model's guess, and the rule is
 * removed (or restored, if it existed before). Entries or a rule the person changed since are left as
 * they are. The payee then stays in Teach for the person to decide.
 */
export async function undoAutoTaught(id: string): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const [record] = await db.select().from(autoTaughtPayees).where(and(eq(autoTaughtPayees.id, id), isNull(autoTaughtPayees.undoneAt)));
  if (!record) return { ok: false, message: "Already undone. Refresh the page." };
  const payload = JSON.stringify(record.entriesBefore.map((b) => ({ id: b.id, category_id: b.categoryId, notes: b.notes, import_category_id: b.importCategoryId, categorized_by: b.categorizedBy, ai_reason: b.aiReason })));
  const was = record.ruleBefore;
  // One statement, so the entries, the rule and the record change together (or not at all, if undone twice).
  const result = await db.execute(sql`
    with mark as (update auto_taught_payees set undone_at = now() where id = ${id}::uuid and undone_at is null returning id),
    before as (select * from jsonb_to_recordset(${payload}::jsonb) as x(id uuid, category_id integer, notes text, import_category_id integer, categorized_by text, ai_reason text)),
    unchanged as (
      select b.* from before b join imported_entries e on e.id = b.id join cash_flows f on f.id = b.id
      where exists (select 1 from mark) and e.status = 'posted' and e.categorized_by = 'rule' and f.category_id = ${record.categoryId}
    ),
    flows as (update cash_flows f set category_id = u.category_id, notes = u.notes, updated_at = now() from unchanged u where f.id = u.id returning f.id),
    entries as (
      update imported_entries e set category_id = u.import_category_id, categorized_by = u.categorized_by, ai_reason = u.ai_reason, updated_at = now()
      from unchanged u where e.id = u.id and e.id in (select id from flows) returning e.id
    ),
    restored_rule as (
      update category_rules set category_id = ${was?.categoryId ?? null}::integer, enabled = ${was?.enabled ?? null}::boolean, auto_post = ${was?.autoPost ?? null}::boolean, updated_at = now()
      where ${was != null} and id = ${record.ruleId}::uuid and category_id = ${record.categoryId} and exists (select 1 from mark) returning id
    ),
    removed_rule as (
      delete from category_rules where ${was == null} and id = ${record.ruleId}::uuid and category_id = ${record.categoryId} and exists (select 1 from mark) returning id
    )
    select (select count(*) from mark)::int as undone, (select count(*) from entries)::int as entries`);
  if (!Number(result.rows[0]?.undone)) return { ok: false, message: "Already undone. Refresh the page." };
  return { ok: true, message: `${record.payee} is back in Sort these, and won't be sorted automatically again.` };
}
