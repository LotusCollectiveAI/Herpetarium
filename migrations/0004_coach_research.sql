ALTER TABLE "coach_runs"
ADD COLUMN "search_policy" jsonb DEFAULT '{"policyId":"fixed_v1","commitThreshold":0.5,"rollbackWindowSprints":3,"noveltyWeight":0.1,"conservationWeight":0.9,"evidenceHorizonSprints":5}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "patch_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"sprint_number" integer NOT NULL,
	"module" varchar(32) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"delta" jsonb,
	"genome_before" jsonb,
	"genome_after" jsonb,
	"measured_outcome" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_yield" (
	"id" serial PRIMARY KEY NOT NULL,
	"arena_id" varchar(64) NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"coverage" real DEFAULT 0 NOT NULL,
	"variance" real,
	"correlation_with_next_sprint_win_rate" real,
	"correlation_with_commit_decision" real,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
