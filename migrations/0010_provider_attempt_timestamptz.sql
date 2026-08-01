-- Reconcile databases that ran the original 0009 with timestamp-without-zone
-- lifecycle columns before the live smoke exposed mixed clock semantics.
--
-- Legacy started_at came from PostgreSQL DEFAULT now() rendered into the
-- session timezone, so conversion must interpret that wall time in the
-- database's current session timezone. Legacy completed_at came from a
-- JavaScript Date serialized by Drizzle as UTC wall time, so it must be
-- interpreted as UTC. This assumes the database timezone has not changed since
-- the legacy started_at values were written.
DO $migration$
BEGIN
  IF to_regclass('public.provider_attempts') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_attempts'
      AND column_name = 'started_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "public"."provider_attempts"
      ALTER COLUMN "started_at" TYPE timestamp with time zone
      USING "started_at" AT TIME ZONE current_setting('TimeZone');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_attempts'
      AND column_name = 'completed_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "public"."provider_attempts"
      ALTER COLUMN "completed_at" TYPE timestamp with time zone
      USING "completed_at" AT TIME ZONE 'UTC';
  END IF;

  ALTER TABLE "public"."provider_attempts"
    ALTER COLUMN "started_at" SET DEFAULT now();
END
$migration$;
