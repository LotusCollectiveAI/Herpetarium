ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "quality_status" varchar(20) DEFAULT 'clean' NOT NULL;

ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "quality_summary" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_matches_quality_status" ON "matches" ("quality_status");
