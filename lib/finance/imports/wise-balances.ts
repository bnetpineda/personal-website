import "server-only";
import { createHash } from "node:crypto";
import { and, eq, getTableColumns, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections, holdings } from "@/lib/db/schema";
import { pgCode } from "@/lib/db/errors";
import { ingestQuery } from "./service";
import { ImportError, type ImportEntry } from "./types";
import type { WiseClosingBalance } from "./wise-csv";

const SOURCE = "wise:personal";
export interface WiseBalancePreview extends WiseClosingBalance {
  choices: { id: string; name: string; updatedAt: string; asOf: string | null; amount: number }[];
  selected: string;
}

export async function previewWiseBalances(balances: WiseClosingBalance[]): Promise<WiseBalancePreview[]> {
  const rows = await getDb().select({ ...getTableColumns(holdings), version: sql<string>`${holdings.updatedAt}::text` }).from(holdings).where(and(eq(holdings.assetClass, "cash"),
    or(eq(holdings.statementSource, SOURCE), sql`lower(coalesce(${holdings.platform}, '')) = 'wise'`)));
  return balances.map((balance) => {
    const matching = rows.filter((h) => h.currency === balance.currency && !h.archived);
    const mapped = matching.find((h) => h.statementSource === SOURCE);
    const choices = (mapped ? [mapped] : matching).map((h) => ({ id: h.id, name: h.name, updatedAt: h.version, asOf: h.statementAsOf, amount: h.quantity }));
    return { ...balance, choices, selected: choices.length === 1 ? choices[0].id : !choices.length ? "new" : "" };
  });
}

/**
 * For unattended imports: a closing balance is applied only where the target is certain. Wise must
 * not already count through the API, one Wise holding (or none yet) must match the currency, and no
 * different balance may be saved for that date. Anything else imports transactions only.
 */
export async function autoBalanceTargets(balances: WiseClosingBalance[]) {
  const data = new FormData(), chosen: WiseClosingBalance[] = [], skipped: string[] = [];
  if (!balances.length) return { data, balances: chosen, skipped, apiCounted: false };
  const [connection] = await getDb().select({ included: accountConnections.includeInNetWorth }).from(accountConnections).where(eq(accountConnections.provider, "wise"));
  if (connection?.included) return { data, balances: chosen, skipped, apiCounted: true };
  data.set("updateBalances", "on");
  for (const balance of await previewWiseBalances(balances)) {
    const existing = balance.choices.find((h) => h.id === balance.selected);
    if (!balance.selected || (existing?.asOf === balance.asOf && existing.amount !== balance.amount)) { skipped.push(balance.currency); continue; }
    data.set(`holding:${balance.currency}`, balance.selected);
    if (existing) data.set(`version:${balance.currency}`, existing.updatedAt);
    chosen.push({ currency: balance.currency, amount: balance.amount, asOf: balance.asOf });
  }
  return { data, balances: chosen, skipped, apiCounted: false };
}

export interface WiseBalanceWrite extends WiseClosingBalance { id: string; version: string | null }
export function wiseBalanceQuery(plans: WiseBalanceWrite[]) {
  const payload = plans.map((p) => ({ id: p.id, currency: p.currency, amount: p.amount, as_of: p.asOf, version: p.version }));
  return sql`with incoming as (select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
    as x(id uuid, currency text, amount numeric, as_of date, version timestamptz)),
  saved as (
    insert into holdings (id, asset_class, name, platform, quantity, avg_cost, currency, price_source, last_price, statement_source, statement_as_of)
    select id, 'cash', 'Wise ' || currency, 'Wise',
      case when not exists(select 1 from account_connections where provider = 'wise' and include_in_net_worth) then amount else null end,
      1, currency, 'manual', 1, ${SOURCE}, as_of from incoming
    on conflict (id) do update set quantity = case when
      holdings.updated_at = (select version from incoming where incoming.id = holdings.id)
      and not holdings.archived and holdings.asset_class = 'cash' and holdings.currency = excluded.currency
      and (holdings.statement_source is null or holdings.statement_source = excluded.statement_source)
      and (holdings.statement_as_of is null or holdings.statement_as_of < excluded.statement_as_of
        or (holdings.statement_as_of = excluded.statement_as_of and holdings.quantity = excluded.quantity))
      then excluded.quantity else null end,
      avg_cost = 1, last_price = 1, price_source = 'manual', price_ref = null,
      statement_source = excluded.statement_source, statement_as_of = excluded.statement_as_of, updated_at = now()
    returning id
  ) select count(*)::int as updated from saved`;
}

export async function saveWiseImport(entries: ImportEntry[], balances: WiseClosingBalance[], data: FormData) {
  const db = getDb();
  const plans: WiseBalanceWrite[] = [];
  let older = 0;
  if (data.get("updateBalances") === "on" && balances.length) {
    const [connection] = await db.select({ included: accountConnections.includeInNetWorth }).from(accountConnections).where(eq(accountConnections.provider, "wise"));
    if (connection?.included) throw new ImportError("Wise API balances already count toward net worth. Turn off closing-balance updates for this import to avoid counting them twice.");
    for (const balance of await previewWiseBalances(balances)) {
      const target = String(data.get(`holding:${balance.currency}`) ?? balance.selected);
      const existing = balance.choices.find((h) => h.id === target);
      if (existing) {
        if (existing.asOf && existing.asOf > balance.asOf) { older++; continue; }
        if (existing.asOf === balance.asOf && existing.amount !== balance.amount) throw new ImportError("A different balance is already saved for that date. Import transactions only, or review the holding before replacing it.");
        const version = data.get(`version:${balance.currency}`);
        if (version !== existing.updatedAt) throw new ImportError("The holding changed after preview. Preview this statement again.");
        plans.push({ ...balance, id: existing.id, version: existing.updatedAt });
      } else if (target === "new" && !balance.choices.length) {
        // Stable UUID prevents concurrent first imports from creating two holdings.
        const hash = createHash("sha256").update(`${SOURCE}:${balance.currency}`).digest("hex");
        const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        plans.push({ ...balance, id, version: null });
      } else throw new ImportError(`Choose the existing Wise ${balance.currency} cash holding to update.`);
    }
  }
  try {
    // Neon batch runs both statements in one transaction. A stale balance or changed source rolls everything back.
    const [saved] = await db.batch([db.execute(ingestQuery(entries)), db.execute(wiseBalanceQuery(plans))]);
    return { inserted: Number(saved.rows[0]?.inserted ?? 0), duplicates: Number(saved.rows[0]?.duplicates ?? 0), balances: plans.length, older };
  } catch (error) {
    if (["23502", "23505"].includes(pgCode(error) ?? "")) throw new ImportError("A saved transaction or holding changed, or this currency is already mapped to an archived holding. Nothing was imported. Check Holdings and preview again.");
    throw error;
  }
}
