CREATE TABLE "ai_usage_snapshots" (
	"machine_id" text PRIMARY KEY NOT NULL,
	"machine_label" text NOT NULL,
	"timezone" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
