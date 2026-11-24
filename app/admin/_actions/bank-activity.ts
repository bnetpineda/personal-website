"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { importedEntries } from "@/lib/db/schema";
import { fxToPhp } from "@/lib/finance/calc";
import { refileChoices } from "@/lib/finance/imports/review";
import { failure, idSchema, type FormState } from "@/lib/finance/schemas";
import { ensureFx } from "@/lib/finance/service";

/*
 * Bank activity: re-filing a bank import the rules or AI got wrong. Every move is the person's own
 * decision (categorized_by = 'manual'), so the model learns from it and nothing re-files it later.
 * A move away from Transactions deletes the entry posted for it (same id); leaving a transfer pair
 * unlinks its partner too.
 */

const BANKS = sql`('wise', 'maribank', 'gotyme')`;

async function entryFor(id: string) {
  const [entry] = await getDb().select().from(importedEntries).where(eq(importedEntries.id, id)).limit(1);
  return entry;
}

function done(message: string): FormState {
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

/** Posts a bank import to Transactions in a category of its kind (money in → income, out → spending). */
export async function postBankEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({ id: idSchema, categoryId: z.coerce.number({ error: "Pick a category" }).int().positive("Pick a category") })
    .safeParse({ id: formData.get("id"), categoryId: formData.get("categoryId") || undefined });
  if (!parsed.success) return failure("Pick a category.", formData, { categoryId: ["Pick a category"] });
  const { id, categoryId } = parsed.data;
  const entry = await entryFor(id);
  if (!entry || !refileChoices(entry).post) return failure("This entry can't be posted. Refresh the page.", formData);
  let rate: number | null = null;
  try { rate = fxToPhp(await ensureFx([entry.currency]), entry.currency); } catch { rate = null; }
  if (!rate) return failure(`Couldn't get a ${entry.currency}→PHP rate. Try again.`, formData);
  const result = await getDb().execute(sql`
    with source as materialized (select * from imported_entries where id = ${id}::uuid and provider in ${BANKS} and status <> 'posted' for update),
    cat as (select c.* from categories c join source s on c.kind::text = case when s.amount > 0 then 'income' else 'expense' end where c.id = ${categoryId} and not c.archived),
    posted as (
      insert into cash_flows (id, kind, occurred_on, amount, currency, amount_php, category_id, description, account, notes)
      select s.id, c.kind, s.occurred_on, round(abs(s.amount), 2), s.currency, round(abs(s.amount) * ${rate}::numeric, 2), c.id,
        s.description, upper(s.provider), 'Imported transaction, filed by you from Bank activity; PHP conversion uses the rate at posting.'
      from source s cross join cat c where round(abs(s.amount) * ${rate}::numeric, 2) < 1000000000000
      on conflict (id) do nothing returning id
    ), partner as (
      update imported_entries p set transfer_id = null, updated_at = now() from source s
      where s.transfer_id is not null and p.transfer_id = s.transfer_id and p.id <> s.id and exists (select 1 from posted)
    )
    update imported_entries e set status = 'posted', category_id = ${categoryId}, categorized_by = 'manual', ai_reason = null, ai_suggestion = null,
      transfer_id = null, updated_at = now()
    where e.id in (select id from posted) returning e.id`);
  if (!result.rows.length) return failure("Choose an active category that matches money in or out.", formData, { categoryId: ["Pick another category"] });
  return done(`Posted ${entry.description} to Transactions.`);
}

/** Files a bank import as a transfer between your own accounts, or ignores it. Either way it leaves Transactions. */
export async function fileBankEntry(id: string, as: "transfer" | "ignore"): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || (as !== "transfer" && as !== "ignore")) return failure("Unknown entry.");
  const entry = await entryFor(id);
  if (!entry || !refileChoices(entry)[as]) return failure("This entry can't be filed that way. Refresh the page.");
  const status = as === "transfer" ? "transfer" : "ignored";
  const result = await getDb().execute(sql`
    with source as materialized (select * from imported_entries where id = ${id}::uuid and provider in ${BANKS} and status <> ${status}
      and (${status} <> 'transfer' or kind in ('payment', 'transfer', 'other')) for update),
    removed as (delete from cash_flows f using source s where f.id = s.id returning f.id),
    partner as (
      update imported_entries p set transfer_id = null, updated_at = now() from source s
      where s.transfer_id is not null and p.transfer_id = s.transfer_id and p.id <> s.id
    )
    update imported_entries e set status = ${status}, category_id = null, categorized_by = 'manual', ai_reason = null, ai_suggestion = null,
      transfer_id = null, updated_at = now()
    from source s where e.id = s.id returning (select count(*) from removed)::int as removed`);
  if (!result.rows.length) return failure("Already filed that way. Refresh the page.");
  const removed = Number(result.rows[0].removed) > 0;
  return done(`${entry.description}: ${as === "transfer" ? "filed as a transfer" : "ignored"}${removed ? ", and removed from Transactions" : ""}.`);
}

/** Separates a wrongly matched transfer pair. Both stay transfers; re-file either one if it wasn't. */
export async function unlinkBankTransfer(id: string): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return failure("Unknown entry.");
  const result = await getDb().execute(sql`
    with source as (select transfer_id from imported_entries where id = ${id}::uuid and provider in ${BANKS} and status = 'transfer' and transfer_id is not null)
    update imported_entries e set transfer_id = null, categorized_by = 'manual', ai_suggestion = null, updated_at = now()
    where e.transfer_id = (select transfer_id from source) returning e.id`);
  if (!result.rows.length) return failure("That pair is already unlinked. Refresh the page.");
  return done("Unlinked. Both stay transfers; re-file either one if it wasn't.");
}
