ALTER TABLE "matches"
ADD COLUMN "arena_id" varchar(64),
ADD COLUMN "run_id" varchar(64),
ADD COLUMN "opponent_run_id" varchar(64),
ADD COLUMN "sprint_number" integer,
ADD COLUMN "match_kind" varchar(24),
ADD COLUMN "anchor_label" varchar(64),
ADD COLUMN "role_swap_group_id" varchar(64),
ADD COLUMN "focal_team" varchar(10),
ADD COLUMN "game_rules" jsonb;
