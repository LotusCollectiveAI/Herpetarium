-- Index ai_call_logs.match_id
--
-- ai_call_logs is the largest table in the schema (one row per AI call, per
-- round, per match) and every read of it filters on match_id: cumulative
-- cost totals (IN over a run's completed matches), per-match log listings,
-- the reasoning-trace presence scan, and the CSV/JSON export endpoints.
-- Without this index each of those was a full sequential scan.
--
-- On a large existing table CREATE INDEX takes a write lock for the
-- duration. If that matters, run the CONCURRENTLY form by hand instead --
-- it cannot be used here because migrations run inside a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_call_logs_match_id"
--     ON "ai_call_logs" ("match_id");

CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_match_id" ON "ai_call_logs" ("match_id");
