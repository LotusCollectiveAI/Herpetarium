ALTER TABLE "matches"
ADD COLUMN IF NOT EXISTS "strict_execution" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_call_logs"
ADD COLUMN IF NOT EXISTS "provider_metadata" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" integer,
  "game_id" varchar(100),
  "round_number" integer,
  "action_type" varchar(30) NOT NULL,
  "provider" varchar(20) NOT NULL,
  "model" varchar(100) NOT NULL,
  "physical_attempt" integer DEFAULT 1 NOT NULL,
  "status" varchar(20) DEFAULT 'started' NOT NULL,
  "request_metadata" jsonb,
  "terminal_metadata" jsonb,
  "error" text,
  "ai_call_log_id" integer,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
