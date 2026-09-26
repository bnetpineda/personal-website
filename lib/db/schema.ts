import { sql } from "drizzle-orm";
import type { ConnectionSnapshot, Provider, SyncProvider } from "../finance/connections/types";
import type { AiSuggestion, CategorizedBy, EntryKind, EntryStatus, HistoryCoverage, SpotTrade } from "../finance/imports/types";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
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
    statementSource: text("statement_source"),
    statementAsOf: date("statement_as_of"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("holdings_statement_currency_unique").on(t.statementSource, t.currency),
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
    /** Set when the entry records a payment towards a debt ("Pay" on the Debts page). */
    liabilityId: uuid("liability_id").references((): AnyPgColumn => liabilities.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("cash_flows_kind_occurred_on_idx").on(t.kind, t.occurredOn),
    index("cash_flows_category_id_idx").on(t.categoryId),
    index("cash_flows_liability_id_idx").on(t.liabilityId),
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

/** One private account connection per syncing provider. Secrets are encrypted before persistence. */
export const accountConnections = pgTable("account_connections", {
  provider: text("provider").$type<SyncProvider>().primaryKey(),
  encryptedCredentials: text("encrypted_credentials").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // Opt in after reviewing existing manual holdings to avoid double counting.
  includeInNetWorth: boolean("include_in_net_worth").notNull().default(false),
  snapshot: jsonb("snapshot").$type<ConnectionSnapshot>(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  error: text("error"),
  credentialsExpireOn: date("credentials_expire_on"),
  historySyncedAt: timestamp("history_synced_at", { withTimezone: true }),
  historyError: text("history_error"),
  historyCoverage: jsonb("history_coverage").$type<HistoryCoverage>(),
  syncLease: uuid("sync_lease"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [check("account_connections_provider", sql`${t.provider} in ('binance', 'ibkr')`)]);

/** Immutable source amounts. Review decisions survive repeated imports and deleted cash-flow entries. */
/**
 * Closing balances from uploaded bank statements (Wise, MariBank), one per account and currency.
 * They count as cash in net worth; an older statement never replaces a newer balance.
 */
export const statementBalances = pgTable("statement_balances", {
  provider: text("provider").$type<Provider>().notNull(),
  account: text("account").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  amount: money("amount").notNull(),
  asOf: date("as_of").notNull(),
  ...timestamps,
}, (t) => [
  primaryKey({ columns: [t.provider, t.account, t.currency] }),
  check("statement_balances_provider", sql`${t.provider} in ('wise', 'maribank')`),
]);

export const importedEntries = pgTable("imported_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").$type<Provider>().notNull(),
  accountKey: text("account_key").notNull(),
  externalId: text("external_id").notNull(),
  occurredOn: date("occurred_on").notNull(),
  kind: text("kind").$type<EntryKind>().notNull(),
  amount: decimal("amount").notNull(),
  // Supports native crypto units. Never assume a three-letter token is fiat.
  currency: varchar("currency", { length: 30 }).notNull(),
  description: text("description").notNull(),
  realizedPnl: decimal("realized_pnl"),
  trade: jsonb("trade").$type<SpotTrade>(),
  status: text("status").$type<EntryStatus>().notNull().default("pending"),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  transferId: uuid("transfer_id"),
  // Who made the review decision; AI decisions keep a one-line reason for the audit trail.
  categorizedBy: text("categorized_by").$type<CategorizedBy>(),
  aiReason: text("ai_reason"),
  // Only meaningful while the entry is pending and categorized_by = 'ai'; every other writer clears it.
  aiSuggestion: text("ai_suggestion").$type<AiSuggestion>(),
  // Set once the model has seen the entry, so scheduled runs never pay to re-ask.
  aiAttemptedAt: timestamp("ai_attempted_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("imported_entries_source_unique").on(t.provider, t.accountKey, t.externalId),
  index("imported_entries_status_date_idx").on(t.status, t.occurredOn),
  index("imported_entries_transfer_idx").on(t.transferId),
  index("imported_entries_binance_trades_idx").on(t.accountKey, t.updatedAt).where(sql`${t.provider} = 'binance' and ${t.trade} is not null`),
  check("imported_entries_provider", sql`${t.provider} in ('wise', 'binance', 'ibkr', 'maribank')`),
  check("imported_entries_kind", sql`${t.kind} in ('payment','transfer','reward','dividend','interest','fee','tax','trade','other')`),
  check("imported_entries_status", sql`${t.status} in ('pending','posted','ignored','transfer','reviewed')`),
  check("imported_entries_categorized_by", sql`${t.categorizedBy} is null or ${t.categorizedBy} in ('rule','ai','manual')`),
  check("imported_entries_ai_suggestion", sql`${t.aiSuggestion} is null or ${t.aiSuggestion} in ('post','transfer','investment','ignore')`),
]);

/** One durable cursor per Binance account and stream. No credentials are stored here. */
export const investmentSyncs = pgTable("investment_syncs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountKey: text("account_key").notNull(),
  scope: text("scope").notNull(),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  cursor: text("cursor").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  error: text("error"),
  lease: uuid("lease"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [uniqueIndex("investment_syncs_account_scope_unique").on(t.accountKey, t.scope)]);

/** Report ranges are evidence of an import, not proof that an entire account history is complete. */
export const investmentReports = pgTable("investment_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").$type<Provider>().notNull(),
  fileHash: text("file_hash").notNull(),
  accounts: jsonb("accounts").$type<string[]>().notNull(),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  entries: integer("entries").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("investment_reports_file_unique").on(t.provider, t.fileHash)]);

export const categoryRules = pgTable("category_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  contains: text("contains").notNull(),
  provider: text("provider").$type<Provider>(),
  kind: cashFlowKindEnum("kind").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  autoPost: boolean("auto_post").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

/** Cached per-pair Spot FIFO. `asOf` is "" for all imported fills, or a balance snapshot time. */
export const spotFifo = pgTable("spot_fifo", {
  accountKey: text("account_key").notNull(),
  asOf: text("as_of").notNull(),
  symbol: text("symbol").notNull(),
  baseAsset: text("base_asset").notNull(),
  quoteAsset: text("quote_asset").notNull(),
  bought: doublePrecision("bought").notNull(),
  sold: doublePrecision("sold").notNull(),
  remaining: doublePrecision("remaining").notNull(),
  cost: doublePrecision("cost").notNull(),
  realized: doublePrecision("realized").notNull(),
  unmatched: integer("unmatched").notNull(),
  externalFees: integer("external_fees").notNull(),
}, (t) => [primaryKey({ columns: [t.accountKey, t.asOf, t.symbol] })]);

/** Signature of the trade rows a FIFO cache was built from, so a page can tell when to rebuild. */
export const spotFifoMeta = pgTable("spot_fifo_meta", {
  accountKey: text("account_key").notNull(),
  asOf: text("as_of").notNull(),
  sourceCount: integer("source_count").notNull(),
  sourceHash: text("source_hash").notNull().default(""),
  ignoredBases: text("ignored_bases").array().notNull(),
  paymentAssets: text("payment_assets").array().notNull(),
}, (t) => [primaryKey({ columns: [t.accountKey, t.asOf] })]);

/** Alert content is derived from current data; only dismissals need persistence. */
export const notificationDismissals = pgTable("notification_dismissals", {
  key: text("key").primaryKey(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImportedEntry = typeof importedEntries.$inferSelect;
export type CategoryRule = typeof categoryRules.$inferSelect;

export type Holding = typeof holdings.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type CashFlow = typeof cashFlows.$inferSelect;
export type RecurringCashFlow = typeof recurringCashFlows.$inferSelect;
export type Liability = typeof liabilities.$inferSelect;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
