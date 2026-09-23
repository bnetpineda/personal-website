ALTER TABLE "cash_flows" ADD COLUMN "liability_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_liability_id_liabilities_id_fk" FOREIGN KEY ("liability_id") REFERENCES "public"."liabilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_flows_liability_id_idx" ON "cash_flows" USING btree ("liability_id");