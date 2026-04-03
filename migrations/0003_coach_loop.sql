CREATE TABLE "coach_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL,
	"config" jsonb NOT NULL,
	"initial_genome" jsonb NOT NULL,
	"current_genome" jsonb NOT NULL,
	"current_beliefs" jsonb DEFAULT '[]'::jsonb,
	"current_sprint" integer DEFAULT 0 NOT NULL,
	"arena_id" varchar(64),
	"budget_cap_usd" varchar(20),
	"actual_cost_usd" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coach_sprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"sprint_number" integer NOT NULL,
	"opponent_run_id" varchar(64),
	"match_ids" jsonb DEFAULT '[]'::jsonb,
	"record" varchar(20) NOT NULL,
	"win_rate" varchar(20) NOT NULL,
	"genome_before" jsonb NOT NULL,
	"genome_after" jsonb NOT NULL,
	"beliefs_after" jsonb DEFAULT '[]'::jsonb,
	"decision" varchar(10) NOT NULL,
	"patch" jsonb,
	"disclosure_text" text,
	"research_metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
