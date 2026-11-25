CREATE TABLE "auto_taught_payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payee" text NOT NULL,
	"payee_key" text NOT NULL,
	"kind" "cash_flow_kind" NOT NULL,
	"category_id" integer NOT NULL,
	"rule_id" uuid,
	"rule_before" jsonb,
	"entries_before" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auto_taught_payees" ADD CONSTRAINT "auto_taught_payees_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_taught_payees" ADD CONSTRAINT "auto_taught_payees_rule_id_category_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."category_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_taught_payees_key_idx" ON "auto_taught_payees" USING btree ("payee_key","kind");