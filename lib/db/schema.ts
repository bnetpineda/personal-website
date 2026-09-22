import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
// Relative import on purpose: drizzle-kit loads this file without tsconfig path aliases.
import {
  ASSET_CLASSES,
  CASH_FLOW_KINDS,
  LIABILITY_KINDS,
  PRICE_SOURCES,
  RECURRENCE_FREQUENCIES,
  type AssetClass,
} from "../finance/constants";

export const assetClassEnum = pgEnum("asset_class", ASSET_CLASSES);
export const priceSourceEnum = pgEnum("price_source", PRICE_SOURCES);
export const cashFlowKindEnum = pgEnum("cash_flow_kind", CASH_FLOW_KINDS);
export const liabilityKindEnum = pgEnum("liability_kind", LIABILITY_KINDS);
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", RECURRENCE_FREQUENCIES);

/* Unbounded numerics keep tiny token prices exact; money amounts use (14,2). */
const decimal = (name: string) => numeric(name, { mode: "number" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const currency = () => varchar("currency", { length: 3 }).notNull().default("PHP");

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetClass: assetClassEnum("asset_class").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol"),
    platform: text("platform"),
    quantity: decimal("quantity").notNull(),
    /** Average cost per unit, in `currency`. */
    avgCost: decimal("avg_cost").notNull(),
    currency: currency(),
    priceSource: priceSourceEnum("price_source").notNull().default("manual"),
    /** CoinGecko API id (e.g. "bitcoin") or Finnhub ticker (e.g. "VOO"). */
    priceRef: text("price_ref"),
    /** Latest unit price in `currency`; null means "value at cost" (e.g. cash). */
    lastPrice: decimal("last_price"),
    /** Quote time reported by the provider (or when a manual price was entered). */
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    check("holdings_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("holdings_quantity_nonnegative", sql`${t.quantity} >= 0`),
    check("holdings_avg_cost_nonnegative", sql`${t.avgCost} >= 0`),
    check("holdings_last_price_nonnegative", sql`${t.lastPrice} is null or ${t.lastPrice} >= 0`),
  ]
);

export const fxRates = pgTable("fx_rates", {
  currency: varchar("currency", { length: 3 }).primaryKey(),
  /** PHP per 1 unit of `currency`. */
  rateToPhp: decimal("rate_to_php").notNull(),
  /** Reference date published by the FX provider. */
  asOf: date("as_of").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    kind: cashFlowKindEnum("kind").notNull(),
    name: text("name").notNull(),
    color: varchar("color", { length: 7 }).notNull(),
    /** Monthly budget in PHP (expense categories only). */
    monthlyBudget: money("monthly_budget"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categories_kind_name_unique").on(t.kind, t.name),
    check("categories_color_hex", sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("categories_budget_nonnegative", sql`${t.monthlyBudget} is null or ${t.monthlyBudget} >= 0`),
  ]
);

export const cashFlows = pgTable(
  "cash_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: cashFlowKindEnum("kind").notNull(),
    occurredOn: date("occurred_on").notNull(),
    amount: money("amount").notNull(),
    currency: currency(),
    /** `amount` converted to PHP with the FX rate at save time. */
    amountPhp: money("amount_php").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    /** Where the money moved, e.g. "GCash" or "BPI credit card". */
    account: text("account"),
    notes: text("notes"),
    /** Set when the entry was posted from a recurring item. */
    recurringId: uuid("recurring_id").references((): AnyPgColumn => recurringCashFlows.id, { onDelete: "set null" }),
    /** The scheduled occurrence it was posted for (occurred_on may be edited afterwards). */
    recurringOn: date("recurring_on"),
    ...timestamps,
  },
  (t) => [
    index("cash_flows_kind_occurred_on_idx").on(t.kind, t.occurredOn),
    index("cash_flows_category_id_idx").on(t.categoryId),
    // One entry per scheduled occurrence, so overlapping cron/page-view runs can't double-post.
    uniqueIndex("cash_flows_recurring_occurrence_unique").on(t.recurringId, t.recurringOn),
    check("cash_flows_amount_positive", sql`${t.amount} > 0`),
    check("cash_flows_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ]
);

/** Template for income/expenses that repeat (salary, rent, subscriptions…). */
export const recurringCashFlows = pgTable(
  "recurring_cash_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: cashFlowKindEnum("kind").notNull(),
    amount: money("amount").notNull(),
    currency: currency(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    account: text("account"),
    notes: text("notes"),
    frequency: recurrenceFrequencyEnum("frequency").notNull(),
    /** First occurrence; anchors the day of month / weekday. */
    startOn: date("start_on").notNull(),
    /** "Twice a month" only: the other day of month. */
    secondDay: smallint("second_day"),
    endOn: date("end_on"),
    /** Oldest occurrence not yet posted, confirmed or skipped; null once the schedule has ended. */
    nextOn: date("next_on"),
    /** true: post entries automatically on their date; false: wait for confirmation (variable bills). */
    autoPost: boolean("auto_post").notNull().default(true),
    paused: boolean("paused").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("recurring_cash_flows_next_on_idx").on(t.nextOn),
    check("recurring_amount_positive", sql`${t.amount} > 0`),
    check("recurring_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("recurring_second_day_range", sql`${t.secondDay} is null or ${t.secondDay} between 1 and 31`),
    check("recurring_end_after_start", sql`${t.endOn} is null or ${t.endOn} >= ${t.startOn}`),
  ]
);

export const liabilities = pgTable(
  "liabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: liabilityKindEnum("kind").notNull(),
    name: text("name").notNull(),
    lender: text("lender"),
    balance: money("balance").notNull(),
    currency: currency(),
    creditLimit: money("credit_limit"),
    /** Interest rate in percent, as quoted by the lender. */
    interestRate: numeric("interest_rate", { precision: 7, scale: 3, mode: "number" }),
    dueDay: smallint("due_day"),
    minPayment: money("min_payment"),
    archived: boolean("archived").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    check("liabilities_balance_nonnegative", sql`${t.balance} >= 0`),
    check("liabilities_due_day_range", sql`${t.dueDay} is null or ${t.dueDay} between 1 and 31`),
    check("liabilities_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ]
);

export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  /** Calendar date in Asia/Manila (computed in JS, never SQL CURRENT_DATE). */
  snapshotDate: date("snapshot_date").primaryKey(),
  assetsPhp: numeric("assets_php", { precision: 18, scale: 2, mode: "number" }).notNull(),
  liabilitiesPhp: numeric("liabilities_php", { precision: 18, scale: 2, mode: "number" }).notNull(),
  netWorthPhp: numeric("net_worth_php", { precision: 18, scale: 2, mode: "number" }).notNull(),
  investedPhp: numeric("invested_php", { precision: 18, scale: 2, mode: "number" }).notNull(),
  byClass: jsonb("by_class").$type<Partial<Record<AssetClass, number>>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ipHash: text("ip_hash").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_ip_hash_created_at_idx").on(t.ipHash, t.createdAt),
    index("login_attempts_created_at_idx").on(t.createdAt),
  ]
);

export type Holding = typeof holdings.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type CashFlow = typeof cashFlows.$inferSelect;
export type RecurringCashFlow = typeof recurringCashFlows.$inferSelect;
export type Liability = typeof liabilities.$inferSelect;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
