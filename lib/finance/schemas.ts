import { z } from "zod";
import {
  ASSET_CLASSES,
  CASH_FLOW_KINDS,
  COINGECKO_PRESETS,
  CURRENCIES,
  LIABILITY_KINDS,
  PRICE_SOURCES,
} from "./constants";

/*
 * Form schemas + form-state helpers shared by Server Actions and client forms.
 * Lives outside "use server" files (those may only export async functions).
 */

const MAX_MONEY = 999_999_999_999; // numeric(14,2)

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/** "" → undefined (so it isn't coerced to 0), strips thousands separators and ₱. */
const toNumber = (v: unknown) => {
  const b = blank(v);
  return typeof b === "string" ? Number(b.replace(/[,\s₱]/g, "")) : b;
};

const text = (max: number, required: string) => z.string({ error: required }).trim().min(1, required).max(max);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const amount = (required: string) =>
  z.preprocess(toNumber, z.number({ error: required }).min(0, "Can't be negative").max(MAX_MONEY, "Too large"));
const optionalAmount = () =>
  z.preprocess(toNumber, z.number({ error: "Enter a number" }).min(0, "Can't be negative").max(MAX_MONEY, "Too large").optional());
const decimal = (required: string) =>
  z.preprocess(toNumber, z.number({ error: required }).min(0, "Can't be negative"));
const optionalDecimal = () => z.preprocess(toNumber, z.number({ error: "Enter a number" }).min(0, "Can't be negative").optional());
const positive = (required: string) => z.preprocess(toNumber, z.number({ error: required }).positive("Must be more than 0"));
const currency = z.enum(CURRENCIES, { error: "Pick a currency" });

export const idSchema = z.uuid();

export const holdingSchema = z
  .object({
    assetClass: z.enum(ASSET_CLASSES, { error: "Pick an asset class" }),
    name: text(120, "Name is required"),
    symbol: optionalText(20),
    platform: optionalText(60),
    currency,
    priceSource: z.enum(PRICE_SOURCES, { error: "Pick a price source" }),
    priceRef: optionalText(80),
    quantity: decimal("Enter a quantity"),
    avgCost: optionalDecimal(),
    lastPrice: optionalDecimal(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.assetClass === "cash") return;
    if (v.avgCost == null) ctx.addIssue({ code: "custom", path: ["avgCost"], message: "Enter the average cost" });
    if (v.priceSource === "finnhub") {
      if (v.currency !== "USD") ctx.addIssue({ code: "custom", path: ["currency"], message: "Finnhub quotes are in USD" });
      if (!v.priceRef && !v.symbol) ctx.addIssue({ code: "custom", path: ["priceRef"], message: "Enter the ticker" });
    }
    if (v.priceSource === "coingecko") {
      const ref = v.priceRef ?? COINGECKO_PRESETS[v.symbol?.toUpperCase() ?? ""];
      if (!ref) ctx.addIssue({ code: "custom", path: ["priceRef"], message: "Enter the CoinGecko API id (e.g. bitcoin)" });
      else if (!/^[a-z0-9-]+$/i.test(ref)) ctx.addIssue({ code: "custom", path: ["priceRef"], message: "Letters, digits and dashes only" });
    }
  })
  .transform((v) => {
    const symbol = v.symbol?.toUpperCase();
    if (v.assetClass === "cash") {
      // Cash is valued at face value: quantity = balance, 1 unit costs 1.
      return { ...v, symbol, avgCost: 1, lastPrice: null, priceSource: "manual" as const, priceRef: null };
    }
    const priceRef =
      v.priceSource === "finnhub"
        ? (v.priceRef ?? symbol ?? "").toUpperCase()
        : v.priceSource === "coingecko"
          ? (v.priceRef ?? COINGECKO_PRESETS[symbol ?? ""] ?? "").toLowerCase()
          : null;
    return {
      ...v,
      symbol,
      avgCost: v.avgCost ?? 0,
      lastPrice: v.priceSource === "manual" ? (v.lastPrice ?? null) : null,
      priceRef,
    };
  });
export type HoldingInput = z.output<typeof holdingSchema>;

export const adjustSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("buy"),
    quantity: positive("Enter the quantity bought"),
    price: decimal("Enter the price per unit"),
    fee: optionalDecimal(),
  }),
  z.object({ type: z.literal("sell"), quantity: positive("Enter the quantity sold") }),
]);

export const cashFlowSchema = z.object({
  kind: z.enum(CASH_FLOW_KINDS),
  occurredOn: z.iso.date({ error: "Pick a date" }),
  amount: amount("Enter an amount").refine((n) => n > 0, "Must be more than 0"),
  currency,
  categoryId: z.coerce.number({ error: "Pick a category" }).int().positive("Pick a category"),
  description: text(200, "Add a short description"),
  account: optionalText(60),
  notes: optionalText(500),
});
export type CashFlowInput = z.output<typeof cashFlowSchema>;

export const liabilitySchema = z.object({
  kind: z.enum(LIABILITY_KINDS, { error: "Pick a type" }),
  name: text(120, "Name is required"),
  lender: optionalText(80),
  balance: amount("Enter the current balance"),
  currency,
  creditLimit: optionalAmount(),
  interestRate: z.preprocess(
    toNumber,
    z.number({ error: "Enter a number" }).min(0, "Can't be negative").max(1000, "Too large").optional()
  ),
  dueDay: z.preprocess(
    toNumber,
    z.number({ error: "Enter a day" }).int("Whole day only").min(1, "Use a day from 1 to 31").max(31, "Use a day from 1 to 31").optional()
  ),
  minPayment: optionalAmount(),
  notes: optionalText(500),
});
export type LiabilityInput = z.output<typeof liabilitySchema>;

export const categorySchema = z.object({
  kind: z.enum(CASH_FLOW_KINDS),
  name: text(40, "Name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Pick a color"),
  monthlyBudget: optionalAmount(),
});
export type CategoryInput = z.output<typeof categorySchema>;

/* ---------- form state ---------- */

export type FieldErrors = Partial<Record<string, string[]>>;

export interface FormState {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Submitted values echoed back on errors (React 19 resets forms after an action). */
  values?: Record<string, string>;
}

export const initialFormState: FormState = { ok: false };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

export function invalid(error: z.ZodError, formData: FormData, message?: string): FormState {
  return { ok: false, message, errors: z.flattenError(error).fieldErrors as FieldErrors, values: formValues(formData) };
}

export function failure(message: string, formData?: FormData, errors?: FieldErrors): FormState {
  return { ok: false, message, errors, values: formData ? formValues(formData) : undefined };
}
