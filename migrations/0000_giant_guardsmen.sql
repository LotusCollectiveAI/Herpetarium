-- Baseline. Represents the whole schema as of the switch from
-- drizzle-kit push to a real migration history.
--
-- The previous migrations/ directory was a hybrid that worked as neither:
-- 0000 was drizzle-generated and journalled, while 0001-0009 were
-- hand-written with no snapshots and no journal entries, so nothing ever
-- applied them. `migrate` would have failed on the first statement of the
-- old 0000 (plain CREATE TABLE against tables that already existed) and
-- `generate` would have diffed against an eight-month-stale snapshot. The
-- indexes those hand-written files added were, accordingly, missing from
-- the database entirely.
--
-- Every statement below is guarded with IF NOT EXISTS, which is what lets
-- a database that predates this history adopt it: `migrate` records the
-- baseline as applied while every statement no-ops. A fresh database runs
-- it for real. This guarding is specific to the baseline -- migrations
-- generated from here on are ordinary and must not be edited this way.

CREATE TABLE IF NOT EXISTS "ai_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer,
	"game_id" varchar(100),
	"round_number" integer,
	"provider" varchar(20) NOT NULL,
	"model" varchar(100) NOT NULL,
	"action_type" varchar(30) NOT NULL,
	"prompt" text NOT NULL,
	"raw_response" text,
	"parsed_result" jsonb,
	"latency_ms" integer,
	"timed_out" boolean DEFAULT false NOT NULL,
	"error" text,
	"parse_quality" varchar(20),
	"used_fallback" boolean DEFAULT false NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"estimated_cost_usd" varchar(20),
	"reasoning_trace" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "anchor_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"sprint_number" integer NOT NULL,
	"proposal_id" varchar(64),
	"variant" varchar(16) NOT NULL,
	"anchor_label" varchar(64) NOT NULL,
	"match_ids" jsonb,
	"summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coach_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL,
	"config" jsonb NOT NULL,
	"initial_genome" jsonb NOT NULL,
	"current_genome" jsonb NOT NULL,
	"current_beliefs" jsonb DEFAULT '[]'::jsonb,
	"current_sprint" integer DEFAULT 0 NOT NULL,
	"arena_id" varchar(64),
	"search_policy" jsonb DEFAULT '{"policyId":"fixed_v1","commitThreshold":0.5,"rollbackWindowSprints":3,"noveltyWeight":0.1,"conservationWeight":0.9,"evidenceHorizonSprints":5,"moduleFocusWeights":{},"explorationBias":0.35,"proposalComplexityPreference":"neutral","reviewStrictness":0.6,"anchorEvidenceWeight":0.5}'::jsonb NOT NULL,
	"current_scratch_notes" jsonb,
	"budget_cap_usd" varchar(20),
	"actual_cost_usd" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coach_sprints" (
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
	"proposal" jsonb,
	"anchor_summary" jsonb,
	"patch_bundle" jsonb,
	"disclosure_text" text,
	"research_metrics" jsonb DEFAULT '{}'::jsonb,
	"scratch_notes_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evolution_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"config" jsonb NOT NULL,
	"population_size" integer DEFAULT 8 NOT NULL,
	"total_generations" integer DEFAULT 10 NOT NULL,
	"current_generation" integer DEFAULT 0 NOT NULL,
	"mutation_rate" varchar(10) DEFAULT '0.3' NOT NULL,
	"crossover_rate" varchar(10) DEFAULT '0.7' NOT NULL,
	"elitism_count" integer DEFAULT 2 NOT NULL,
	"budget_cap_usd" varchar(20),
	"actual_cost_usd" varchar(20),
	"phase_transitions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"model" varchar(100) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"strategy_a" varchar(50) NOT NULL,
	"strategy_b" varchar(50) NOT NULL,
	"num_games" integer DEFAULT 10 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"match_ids_a" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_ids_b" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"evolution_run_id" integer NOT NULL,
	"generation_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"avg_fitness" varchar(20),
	"max_fitness" varchar(20),
	"min_fitness" varchar(20),
	"fitness_std_dev" varchar(20),
	"avg_elo" integer,
	"max_elo" integer,
	"diversity_score" varchar(20),
	"match_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer,
	"game_id" varchar(100) NOT NULL,
	"sequence" integer NOT NULL,
	"round" integer,
	"team" varchar(10),
	"player_id" varchar(100),
	"event_type" varchar(40) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"team" varchar(10) NOT NULL,
	"clue_giver_id" varchar(100) NOT NULL,
	"code" jsonb NOT NULL,
	"clues" jsonb NOT NULL,
	"own_guess" jsonb,
	"opponent_guess" jsonb,
	"own_correct" boolean DEFAULT false NOT NULL,
	"intercepted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"winner" varchar(10),
	"player_configs" jsonb NOT NULL,
	"amber_keywords" jsonb NOT NULL,
	"blue_keywords" jsonb NOT NULL,
	"total_rounds" integer DEFAULT 0 NOT NULL,
	"amber_white_tokens" integer DEFAULT 0 NOT NULL,
	"amber_black_tokens" integer DEFAULT 0 NOT NULL,
	"blue_white_tokens" integer DEFAULT 0 NOT NULL,
	"blue_black_tokens" integer DEFAULT 0 NOT NULL,
	"game_seed" varchar(200),
	"ablations" jsonb,
	"quality_status" varchar(20) DEFAULT 'clean' NOT NULL,
	"quality_summary" jsonb NOT NULL,
	"experiment_id" varchar(100),
	"team_size" integer DEFAULT 3 NOT NULL,
	"arena_id" varchar(64),
	"run_id" varchar(64),
	"opponent_run_id" varchar(64),
	"sprint_number" integer,
	"match_kind" varchar(24),
	"anchor_label" varchar(64),
	"role_swap_group_id" varchar(64),
	"focal_team" varchar(10),
	"game_rules" jsonb,
	"matchmaking_bucket" varchar(24)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_yield" (
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patch_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"sprint_number" integer NOT NULL,
	"module" varchar(32) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"proposal_id" varchar(64),
	"delta" jsonb,
	"genome_before" jsonb,
	"genome_after" jsonb,
	"measured_outcome" jsonb,
	"review_due_sprint" integer,
	"review_status" varchar(24),
	"review_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patch_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"proposal_id" varchar(64) NOT NULL,
	"committed_sprint" integer NOT NULL,
	"review_sprint" integer NOT NULL,
	"status" varchar(24) NOT NULL,
	"evaluations" jsonb,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scratch_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"player_config_hash" varchar(100) NOT NULL,
	"game_index" integer NOT NULL,
	"notes_text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"match_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"config" jsonb NOT NULL,
	"total_games" integer DEFAULT 0 NOT NULL,
	"completed_games" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"note_token_budget" integer DEFAULT 500 NOT NULL,
	"budget_cap_usd" varchar(20),
	"actual_cost_usd" varchar(20),
	"estimated_cost_usd" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sprint_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"sprint_number" integer NOT NULL,
	"evaluation" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_genomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"evolution_run_id" integer NOT NULL,
	"generation_number" integer NOT NULL,
	"parent_ids" jsonb DEFAULT '[]'::jsonb,
	"modules" jsonb NOT NULL,
	"fitness_score" varchar(20),
	"elo_rating" integer DEFAULT 1200 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"interception_rate" varchar(20),
	"miscommunication_rate" varchar(20),
	"lineage_tag" varchar(100),
	"mutation_log" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_chatter" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"game_id" varchar(10) NOT NULL,
	"round_number" integer NOT NULL,
	"team" varchar(10) NOT NULL,
	"phase" varchar(40) NOT NULL,
	"messages" jsonb NOT NULL,
	"total_exchanges" integer DEFAULT 0 NOT NULL,
	"consensus_reached" boolean DEFAULT false NOT NULL,
	"final_answer" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"match_id" integer,
	"match_index" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"config" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"config" jsonb NOT NULL,
	"total_matches" integer DEFAULT 0 NOT NULL,
	"completed_matches" integer DEFAULT 0 NOT NULL,
	"budget_cap_usd" varchar(20),
	"actual_cost_usd" varchar(20),
	"estimated_cost_usd" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_match_id" ON "ai_call_logs" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_matches_quality_status" ON "matches" USING btree ("quality_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_matches_team_size" ON "matches" USING btree ("team_size");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sprint_evaluations_run_id_sprint_number_unique" ON "sprint_evaluations" USING btree ("run_id","sprint_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_chatter_match_id" ON "team_chatter" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_chatter_game_round" ON "team_chatter" USING btree ("game_id","round_number");