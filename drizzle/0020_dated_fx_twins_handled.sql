CREATE TABLE "fx_rate_history" (
	"currency" varchar(3) NOT NULL,
	"on" date NOT NULL,
	"rate_to_php" numeric NOT NULL,
	CONSTRAINT "fx_rate_history_currency_on_pk" PRIMARY KEY("currency","on"),
	CONSTRAINT "fx_rate_history_rate_positive" CHECK ("fx_rate_history"."rate_to_php" > 0)
);
--> statement-breakpoint
ALTER TABLE "imported_entries" ADD COLUMN "twin_cash_flow_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_cash_flows" ADD COLUMN "handled_on" date[] DEFAULT '{}'::date[] NOT NULL;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD CONSTRAINT "imported_entries_twin_cash_flow_id_cash_flows_id_fk" FOREIGN KEY ("twin_cash_flow_id") REFERENCES "public"."cash_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "imported_entries_twin_unique" ON "imported_entries" USING btree ("twin_cash_flow_id");--> statement-breakpoint
-- Link imports already filed as "Already in Transactions" to the logged entry they matched, one to one,
-- so that logged entry can't hide a second, different payment later.
WITH dup AS (
  SELECT e.id, e.occurred_on, e.currency, round(abs(e.amount), 2) AS amount,
    CASE WHEN e.amount > 0 THEN 'income' ELSE 'expense' END AS kind,
    row_number() OVER (PARTITION BY e.occurred_on, e.currency, round(abs(e.amount), 2), sign(e.amount) ORDER BY e.created_at, e.id) AS n
  FROM imported_entries e WHERE e.status = 'ignored' AND e.ai_reason LIKE 'Already in Transactions:%'
), logged AS (
  SELECT f.id, f.occurred_on, f.currency, f.amount, f.kind::text AS kind,
    row_number() OVER (PARTITION BY f.occurred_on, f.currency, f.amount, f.kind ORDER BY f.created_at, f.id) AS n
  FROM cash_flows f WHERE NOT EXISTS (SELECT 1 FROM imported_entries i WHERE i.id = f.id)
)
UPDATE imported_entries e SET twin_cash_flow_id = l.id
FROM dup d JOIN logged l ON l.occurred_on = d.occurred_on AND l.currency = d.currency AND l.amount = d.amount AND l.kind = d.kind AND l.n = d.n
WHERE e.id = d.id;
