import { z } from "zod";
import { ASSET_CLASSES, CASH_FLOW_KINDS, CURRENCIES, GOAL_MEASURES, LIABILITY_KINDS, RECURRENCE_FREQUENCIES } from "./constants";
import { defaultSecondDay } from "./recurrence";

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
const currency = z.enum(CURRENCIES, { error: "Pick a currency" });

export const idSchema = z.uuid();

export const cashFlowSchema = z.object({
  kind: z.enum(CASH_FLOW_KINDS),
  occurredOn: z.iso.date({ error: "Pick a date" }),
  amount: amount("Enter an amount").refine((n) => n > 0, "Must be more than 0"),
  currency,
  categoryId: z.coerce.number({ error: "Pick a category" }).int().positive("Pick a category"),
  /** Optional: a blank description falls back to the category name. */
  description: optionalText(200),
  account: optionalText(60),
  notes: optionalText(500),
  /** Confirming a recurring occurrence ("Post" on a due item). */
  recurringId: z.preprocess(blank, z.uuid().optional()),
  recurringOn: z.preprocess(blank, z.iso.date().optional()),
});
export type CashFlowInput = z.output<typeof cashFlowSchema>;

export const recurringSchema = z
  .object({
    kind: z.enum(CASH_FLOW_KINDS),
    amount: amount("Enter an amount").refine((n) => n > 0, "Must be more than 0"),
    currency,
    categoryId: z.coerce.number({ error: "Pick a category" }).int().positive("Pick a category"),
    description: text(200, "Add a short description"),
    account: optionalText(60),
    notes: optionalText(500),
    frequency: z.enum(RECURRENCE_FREQUENCIES, { error: "Pick how often" }),
    startOn: z.iso.date({ error: "Pick the first date" }),
    /** "auto" (or blank) → 15 days from the start day. */
    secondDay: z.preprocess(
      (v) => (v === "auto" ? undefined : toNumber(v)),
      z.number({ error: "Pick a day" }).int().min(1, "Use a day from 1 to 31").max(31, "Use a day from 1 to 31").optional()
    ),
    endOn: z.preprocess(blank, z.iso.date({ error: "Pick the last date" }).optional()),
    posting: z.enum(["auto", "confirm"]).default("auto"),
  })
  .superRefine((v, ctx) => {
    if (v.endOn && v.endOn < v.startOn) ctx.addIssue({ code: "custom", path: ["endOn"], message: "Must be on or after the first date" });
    if (v.frequency === "semimonthly" && v.secondDay === Number(v.startOn.slice(8, 10))) {
      ctx.addIssue({ code: "custom", path: ["secondDay"], message: "Pick a different day than the first date" });
    }
  })
  .transform(({ posting, ...v }) => ({
    ...v,
    autoPost: posting === "auto",
    secondDay: v.frequency === "semimonthly" ? (v.secondDay ?? defaultSecondDay(v.startOn)) : null,
    endOn: v.endOn ?? null,
  }));
export type RecurringInput = z.output<typeof recurringSchema>;

/** A deleted entry sent back by "Undo" — re-inserted as it was. */
export const restoreCashFlowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CASH_FLOW_KINDS),
  occurredOn: z.iso.date(),
  amount: z.number().positive().max(MAX_MONEY),
  // Any stored code (not just today's CURRENCIES list) — it's putting back what was there.
  currency: z.string().regex(/^[A-Z]{3}$/),
  amountPhp: z.number().min(0).max(MAX_MONEY),
  categoryId: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
  account: z.string().max(60).nullable(),
  notes: z.string().max(500).nullable(),
  recurringId: z.uuid().nullable(),
  recurringOn: z.iso.date().nullable(),
  liabilityId: z.uuid().nullable(),
});
export type RestoreCashFlowInput = z.output<typeof restoreCashFlowSchema>;

export const categorySchema = z.object({
  kind: z.enum(CASH_FLOW_KINDS),
  name: text(40, "Name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Pick a color"),
  monthlyBudget: optionalAmount(),
});
export type CategoryInput = z.output<typeof categorySchema>;

/** A debt: credit card, loan, buy now pay later. Its balance is taken off net worth. */
export const liabilitySchema = z.object({
  kind: z.enum(LIABILITY_KINDS, { error: "Pick a type" }),
  name: text(120, "Name is required"),
  lender: optionalText(80),
  balance: amount("Enter the current balance"),
  currency,
  creditLimit: optionalAmount(),
  interestRate: z.preprocess(toNumber, z.number({ error: "Enter a number" }).min(0, "Can't be negative").max(1000, "Too large").optional()),
  dueDay: z.preprocess(toNumber, z.number({ error: "Enter a day" }).int("Whole day only").min(1, "Use a day from 1 to 31").max(31, "Use a day from 1 to 31").optional()),
  minPayment: optionalAmount(),
  notes: optionalText(500),
});
export type LiabilityInput = z.output<typeof liabilitySchema>;

/** Something you own that no account syncs: cash at home, a car, property, a fund elsewhere. */
export const manualAccountSchema = z.object({
  name: text(120, "Name is required"),
  assetClass: z.enum(ASSET_CLASSES, { error: "Pick a type" }),
  value: amount("Enter what it's worth today"),
  currency,
  platform: optionalText(80),
  notes: optionalText(500),
});
export type ManualAccountInput = z.output<typeof manualAccountSchema>;

export const goalSchema = z
  .object({
    name: text(80, "Name the goal"),
    measure: z.enum(GOAL_MEASURES, { error: "Pick what it tracks" }),
    target: amount("Enter a target").refine((n) => n > 0, "Must be more than 0"),
    saved: optionalAmount(),
    targetOn: z.preprocess(blank, z.iso.date({ error: "Pick a date" }).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.measure === "emergency_fund" && v.target > 36) ctx.addIssue({ code: "custom", path: ["target"], message: "Use a number of months, up to 36" });
    if (v.measure === "manual" && v.saved == null) ctx.addIssue({ code: "custom", path: ["saved"], message: "Enter how much is saved so far" });
  });
export type GoalInput = z.output<typeof goalSchema>;

/** One category's budget for one month; blank means "no budget this month". */
export const monthBudgetSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: optionalAmount(),
});

/* ---------- form state ---------- */

export type FieldErrors = Partial<Record<string, string[]>>;

export interface FormState {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Submitted values echoed back on errors (React 19 resets forms after an action). */
  values?: Record<string, string>;
  /** Id of the record a successful create made (lets the client offer "Undo"). */
  id?: string;
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
