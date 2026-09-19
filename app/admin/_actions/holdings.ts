"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { applyAdjustment } from "@/lib/finance/calc";
import { formatPrice, formatQty } from "@/lib/finance/format";
import { fetchQuote, PriceError } from "@/lib/finance/prices";
import { adjustSchema, failure, holdingSchema, idSchema, invalid, type FormState } from "@/lib/finance/schemas";
import { ensureFx, snapshotQuietly } from "@/lib/finance/service";

function done(message: string): FormState {
  after(snapshotQuietly);
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

export async function saveHolding(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return failure("Unknown holding.", formData);

  const parsed = holdingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const db = getDb();

  const [existing] = id ? await db.select().from(holdings).where(eq(holdings.id, id.data)).limit(1) : [];
  if (id && !existing) return failure("That holding no longer exists.", formData);

  let lastPrice = input.lastPrice;
  let priceUpdatedAt: Date | null = lastPrice != null ? new Date() : null;

  if (input.priceSource === "manual") {
    // Keep the original timestamp when a manual price wasn't actually changed.
    if (existing && existing.priceSource === "manual" && existing.lastPrice === lastPrice) {
      priceUpdatedAt = existing.priceUpdatedAt;
    }
  } else {
    const unchanged =
      existing &&
      existing.priceSource === input.priceSource &&
      existing.priceRef === input.priceRef &&
      existing.currency === input.currency &&
      existing.lastPrice != null;
    if (unchanged) {
      lastPrice = existing.lastPrice;
      priceUpdatedAt = existing.priceUpdatedAt;
    } else {
      // Fetching a quote right away doubles as validation of the CoinGecko id / ticker.
      const refError = (message: string) => failure(message, formData, { priceRef: [message] });
      try {
        const quote = await fetchQuote(input.priceSource, input.priceRef!, input.currency);
        if (!quote) {
          return refError(
            input.priceSource === "coingecko"
              ? `CoinGecko has no ${input.currency} price for "${input.priceRef}". Use the coin's API id.`
              : `Finnhub doesn't know the ticker "${input.priceRef}".`
          );
        }
        lastPrice = quote.price;
        priceUpdatedAt = quote.asOf;
      } catch (e) {
        return refError(e instanceof PriceError ? e.message : "Couldn't reach the price service. Try again.");
      }
    }
  }

  try {
    await ensureFx([input.currency]);
  } catch {
    // Non-fatal: the holding is saved and shows up once an FX refresh succeeds.
  }

  const values = {
    assetClass: input.assetClass,
    name: input.name,
    symbol: input.symbol ?? null,
    platform: input.platform ?? null,
    quantity: input.quantity,
    avgCost: input.avgCost,
    currency: input.currency,
    priceSource: input.priceSource,
    priceRef: input.priceRef,
    lastPrice,
    priceUpdatedAt,
    notes: input.notes ?? null,
  };

  if (existing) await db.update(holdings).set(values).where(eq(holdings.id, existing.id));
  else await db.insert(holdings).values(values);

  return done(existing ? `Saved ${input.name}.` : `Added ${input.name}.`);
}

export async function adjustHolding(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure("Unknown holding.", formData);
  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const db = getDb();
  const [holding] = await db.select().from(holdings).where(eq(holdings.id, id.data)).limit(1);
  if (!holding) return failure("That holding no longer exists.", formData);

  const result = applyAdjustment(holding, parsed.data);
  if (!result.ok) return failure(result.error, formData, { quantity: [result.error] });

  await db
    .update(holdings)
    .set({ quantity: result.quantity, avgCost: result.avgCost })
    .where(eq(holdings.id, holding.id));

  const summary =
    result.quantity === 0
      ? `Sold out of ${holding.name} — archive it to hide it.`
      : `Now ${formatQty(result.quantity)} @ ${formatPrice(result.avgCost, holding.currency)} avg.`;
  return done(summary);
}

export async function updateManualPrices(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const updates: { id: string; price: number }[] = [];
  const errors: Record<string, string[]> = {};
  for (const [key, value] of formData) {
    if (!key.startsWith("price:") || typeof value !== "string" || value.trim() === "") continue;
    const id = idSchema.safeParse(key.slice("price:".length));
    const price = Number(value.replace(/[,\s₱]/g, ""));
    if (!id.success) continue;
    if (!Number.isFinite(price) || price < 0) errors[key] = ["Enter a valid price"];
    else updates.push({ id: id.data, price });
  }
  if (Object.keys(errors).length > 0) return failure("Fix the highlighted prices.", formData, errors);
  if (updates.length === 0) return failure("Nothing to update.", formData);

  const db = getDb();
  const current = await db
    .select({ id: holdings.id, lastPrice: holdings.lastPrice, priceSource: holdings.priceSource })
    .from(holdings);
  const byId = new Map(current.map((h) => [h.id, h]));
  const now = new Date();
  const changed = updates.filter((u) => {
    const h = byId.get(u.id);
    return h && h.priceSource === "manual" && h.lastPrice !== u.price;
  });

  if (changed.length > 0) {
    const [first, ...rest] = changed.map((u) =>
      db.update(holdings).set({ lastPrice: u.price, priceUpdatedAt: now }).where(eq(holdings.id, u.id))
    );
    await db.batch([first, ...rest]);
  }
  return done(changed.length === 1 ? "Updated 1 price." : `Updated ${changed.length} prices.`);
}

export async function setHoldingArchived(id: string, archived: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown holding.");
  await getDb().update(holdings).set({ archived }).where(eq(holdings.id, parsed.data));
  return done(archived ? "Archived." : "Restored.");
}

export async function deleteHolding(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown holding.");
  await getDb().delete(holdings).where(eq(holdings.id, parsed.data));
  return done("Deleted.");
}
