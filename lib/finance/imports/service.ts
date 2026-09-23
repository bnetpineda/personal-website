import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pgCode } from "@/lib/db/errors";
import { categoryRules, importedEntries } from "@/lib/db/schema";
import { fxToPhp } from "../calc";
import { CURRENCIES } from "../constants";
import { ensureFx } from "../service";
import { canPost, matchingRule } from "./review";
import { ImportError, uniqueEntries, type ImportEntry } from "./types";

/** One SQL statement makes the whole import atomic, including concurrent duplicate imports. */
export function ingestQuery(input: ImportEntry[], guard: SQL = sql`select 'import' as provider`) {
  const entries = uniqueEntries(input);
  if (entries.length > 25_000) throw new ImportError("This import is too large. Use a shorter statement period.");
  const payload = entries.map((e) => ({ provider: e.provider, account_key: e.accountKey, external_id: e.externalId,
    occurred_on: e.occurredOn, kind: e.kind, amount: e.amount, currency: e.currency, description: e.description, realized_pnl: e.realizedPnl, trade: e.trade ?? null }));
  return sql`
      with guard as materialized (${guard}), incoming as (
        select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(
          provider text, account_key text, external_id text, occurred_on date, kind text, amount numeric,
          currency text, description text, realized_pnl numeric, trade jsonb)
      ), saved as (
        insert into imported_entries (provider, account_key, external_id, occurred_on, kind, amount, currency, description, realized_pnl, trade, status)
        select provider, account_key, external_id, occurred_on, kind, amount, currency, description, realized_pnl, trade,
          case when kind = 'trade' then 'reviewed' else 'pending' end from incoming where exists (select 1 from guard)
        on conflict (provider, account_key, external_id) do update set amount = case
          when (imported_entries.amount, imported_entries.currency, imported_entries.occurred_on, imported_entries.kind, imported_entries.realized_pnl, imported_entries.trade)
            is not distinct from (excluded.amount, excluded.currency, excluded.occurred_on, excluded.kind, excluded.realized_pnl, excluded.trade)
          then imported_entries.amount else null end
        returning (xmax = 0) as inserted
      ) select count(*) filter (where inserted)::int as inserted, count(*) filter (where not inserted)::int as duplicates,
        exists(select 1 from guard) as active from saved`;
}

export async function ingestEntries(input: ImportEntry[], lease?: { provider: string; id: string }) {
  const guard = lease ? sql`select provider from account_connections where provider = ${lease.provider} and sync_lease = ${lease.id}::uuid for update` : undefined;
  try {
    const result = await getDb().execute(ingestQuery(input, guard));
    const row = result.rows[0];
    if (!row?.active) throw new ImportError("The connection changed during import. Sync again.");
    return { inserted: Number(row.inserted), duplicates: Number(row.duplicates) };
  } catch (error) {
    if (pgCode(error) === "23502") throw new ImportError("A transaction ID already exists with different amounts or dates. No records were changed. Check the statement and fee format.");
    throw error;
  }
}

/** Row locks serialize review, auto-posting and transfer matching. The cash-flow ID is the source ID. */
export async function postImportedEntry(id: string, categoryId: number, allowDuplicate = false, extraGuard: SQL = sql`true`) {
  const db = getDb();
  const [entry] = await db.select().from(importedEntries).where(eq(importedEntries.id, id));
  if (!entry || entry.status !== "pending") throw new ImportError("This entry was already reviewed. Refresh the inbox.");
  if (!canPost(entry)) throw new ImportError("Keep trades and crypto units in the earnings ledger. They cannot be posted as a cash expense or income.");
  let rate: number | null = null;
  try { rate = fxToPhp(await ensureFx([entry.currency]), entry.currency); } catch { /* A missing rate blocks posting. */ }
  if (!rate) throw new ImportError("No PHP exchange rate is available. Try again later.");
  if (Math.abs(entry.amount) * rate >= 1_000_000_000_000) throw new ImportError("The converted amount is too large to post as a cash-flow entry.");
  const result = await db.execute(sql`
    with source as materialized (select * from imported_entries where id = ${id}::uuid and status = 'pending' and (${extraGuard}) for update),
    posted as (
      insert into cash_flows (id, kind, occurred_on, amount, currency, amount_php, category_id, description, account, notes)
      select s.id, c.kind, s.occurred_on, round(abs(s.amount), 2), s.currency, round(abs(s.amount) * ${rate}::numeric, 2), c.id,
        s.description, upper(s.provider), 'Imported transaction; PHP conversion uses the exchange rate at posting.'
      from source s join categories c on c.id = ${categoryId} and not c.archived and c.kind::text = case when s.amount > 0 then 'income' else 'expense' end
      where ${allowDuplicate} or not exists (select 1 from cash_flows f where f.occurred_on = s.occurred_on
        and f.currency = s.currency and f.amount = round(abs(s.amount), 2) and f.kind = c.kind)
      on conflict do nothing returning id
    ) update imported_entries set status = 'posted', category_id = ${categoryId}, categorized_by = 'manual', updated_at = now()
      where id in (select id from posted) returning id`);
  if (!result.rows.length) throw new ImportError("Already reviewed, category unavailable, or a matching amount is already logged on this date. Check Transactions before allowing a duplicate.");
}

export async function applyCategoryRules(entryIds?: string[]) {
  const db = getDb();
  const [rules, pending] = await Promise.all([
    db.select().from(categoryRules).where(eq(categoryRules.enabled, true)),
    db.select().from(importedEntries).where(and(eq(importedEntries.status, "pending"),
      inArray(importedEntries.provider, ["wise", "ibkr"]), inArray(importedEntries.currency, [...CURRENCIES]),
      inArray(importedEntries.kind, ["payment", "reward", "dividend", "interest", "fee", "tax"]),
      sql`abs(${importedEntries.amount}) >= 0.005`,
      // Apply rules only to candidates that can match an active rule. Old unrelated entries cannot starve the queue.
      sql`exists (select 1 from category_rules r where r.enabled and (r.provider is null or r.provider = ${importedEntries.provider})
        and r.kind::text = case when ${importedEntries.amount} > 0 then 'income' else 'expense' end
        and position(lower(r.contains) in lower(${importedEntries.description})) > 0)`,
      entryIds ? inArray(importedEntries.id, entryIds) : undefined))
      .orderBy(asc(importedEntries.updatedAt), asc(importedEntries.id)).limit(500),
  ]);
  const rotateQueue = async () => {
    if (pending.length) await db.update(importedEntries).set({ updatedAt: new Date() })
      .where(and(eq(importedEntries.status, "pending"), inArray(importedEntries.id, pending.map((e) => e.id))));
  };
  const matches = pending.flatMap((entry) => { const rule = matchingRule(entry, rules); return rule ? [{ entry, rule }] : []; });
  if (!matches.length) { await rotateQueue(); return { posted: 0, suggested: 0 }; }
  let fx: Awaited<ReturnType<typeof ensureFx>> = {};
  try { fx = await ensureFx([...new Set(matches.filter((m) => m.rule.autoPost).map((m) => m.entry.currency))]); } catch { /* Leave entries waiting for valid FX. */ }
  const payload = matches.map(({ entry, rule }) => ({ id: entry.id, rule_id: rule.id, contains: rule.contains,
    category_id: rule.categoryId, auto_post: rule.autoPost, rate: fxToPhp(fx, entry.currency) }));
  const result = await db.execute(sql`
    with instructions as (select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
      as x(id uuid, rule_id uuid, contains text, category_id integer, auto_post boolean, rate numeric)),
    source as materialized (
      select e.*, i.rate, i.auto_post, i.category_id as target_category from imported_entries e
      join instructions i on e.id = i.id join category_rules r on r.id = i.rule_id and r.enabled
        and r.contains = i.contains and r.category_id = i.category_id and r.auto_post = i.auto_post
        and (r.provider is null or r.provider = e.provider) and r.kind::text = case when e.amount > 0 then 'income' else 'expense' end
      join categories c on c.id = r.category_id and not c.archived and c.kind = r.kind
      where e.status = 'pending' order by e.id for update of e
    ), posted as (
      insert into cash_flows (id, kind, occurred_on, amount, currency, amount_php, category_id, description, account, notes)
      select s.id, (case when s.amount > 0 then 'income' else 'expense' end)::cash_flow_kind,
        s.occurred_on, round(abs(s.amount), 2), s.currency, round(abs(s.amount) * s.rate, 2), s.target_category,
        s.description, upper(s.provider), 'Automatically imported; PHP conversion uses the rate at posting.'
      from source s where s.auto_post and s.rate > 0
        and round(abs(s.amount) * s.rate, 2) < 1000000000000
        and not exists (select 1 from cash_flows f where f.occurred_on = s.occurred_on and f.currency = s.currency
          and f.amount = round(abs(s.amount), 2) and f.kind::text = case when s.amount > 0 then 'income' else 'expense' end)
        and not exists (select 1 from source other where other.id <> s.id and other.occurred_on = s.occurred_on
          and other.currency = s.currency and round(abs(other.amount), 2) = round(abs(s.amount), 2) and sign(other.amount) = sign(s.amount))
      on conflict do nothing returning id
    ), updated as (
      update imported_entries e set category_id = s.target_category, categorized_by = 'rule', ai_reason = null,
        status = case when exists(select 1 from posted p where p.id = e.id) then 'posted' else 'pending' end, updated_at = now()
      from source s where e.id = s.id returning e.status
    ) select count(*) filter(where status = 'posted')::int as posted, count(*) filter(where status = 'pending')::int as suggested from updated`);
  // Ambiguous/archived-category candidates must not permanently block a backlog larger than the batch.
  await rotateQueue();
  return { posted: Number(result.rows[0]?.posted ?? 0), suggested: Number(result.rows[0]?.suggested ?? 0) };
}
