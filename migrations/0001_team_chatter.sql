-- Migration: Add team_chatter table for 3v3 deliberation and team_size to matches

CREATE TABLE IF NOT EXISTS "team_chatter" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"game_id" varchar(10) NOT NULL,
	"round_number" integer NOT NULL,
	"team" varchar(10) NOT NULL,
	"phase" varchar(40) NOT NULL,
	"messages" jsonb DEFAULT '[]' NOT NULL,
	"total_exchanges" integer DEFAULT 0 NOT NULL,
	"consensus_reached" boolean DEFAULT false NOT NULL,
	"final_answer" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_team_chatter_match_id" ON "team_chatter" ("match_id");
CREATE INDEX IF NOT EXISTS "idx_team_chatter_game_round" ON "team_chatter" ("game_id", "round_number");

-- Add team_size column to matches table
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "team_size" integer DEFAULT 2 NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_matches_team_size" ON "matches" ("team_size");
