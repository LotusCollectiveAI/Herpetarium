CREATE TABLE "ai_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer,
	"game_id" varchar(10),
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
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
CREATE TABLE "match_rounds" (
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
CREATE TABLE "matches" (
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
	"blue_black_tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scratch_notes" (
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
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"config" jsonb NOT NULL,
	"total_games" integer DEFAULT 0 NOT NULL,
	"completed_games" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"note_token_budget" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
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
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"config" jsonb NOT NULL,
	"total_matches" integer DEFAULT 0 NOT NULL,
	"completed_matches" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
