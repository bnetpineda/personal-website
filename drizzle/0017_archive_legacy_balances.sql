-- Manual accounts and debts count in net worth again. Rows left from before they were removed are
-- months old, so they start archived: Accounts lists them to update and restore, instead of their
-- stale balances silently changing net worth.
UPDATE "holdings" SET "archived" = true WHERE "archived" = false;
--> statement-breakpoint
UPDATE "liabilities" SET "archived" = true WHERE "archived" = false;
