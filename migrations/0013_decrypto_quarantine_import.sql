CREATE TABLE "decrypto_quarantine_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_app" varchar(32) DEFAULT 'the-table' NOT NULL,
	"source_game_id" varchar(100) NOT NULL,
	"source_completed_at" timestamp with time zone NOT NULL,
	"export_version" varchar(128) NOT NULL,
	"partition" varchar(32) DEFAULT 'legacy_unassigned' NOT NULL,
	"canonical_export" text NOT NULL,
	"canonical_export_sha256" varchar(64) NOT NULL,
	"decision_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decrypto_quarantine_games_source_app_check" CHECK ("decrypto_quarantine_games"."source_app" = 'the-table'),
	CONSTRAINT "decrypto_quarantine_games_partition_check" CHECK ("decrypto_quarantine_games"."partition" = 'legacy_unassigned'),
	CONSTRAINT "decrypto_quarantine_games_canonical_hash_check" CHECK ("decrypto_quarantine_games"."canonical_export_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "decrypto_quarantine_games_decision_count_check" CHECK ("decrypto_quarantine_games"."decision_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "decrypto_quarantine_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"quarantine_game_id" integer NOT NULL,
	"source_decision_id" varchar(200) NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"canonical_decision" text NOT NULL,
	"canonical_decision_sha256" varchar(64) NOT NULL,
	CONSTRAINT "decrypto_quarantine_decisions_idempotency_hash_check" CHECK ("decrypto_quarantine_decisions"."idempotency_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "decrypto_quarantine_decisions_canonical_hash_check" CHECK ("decrypto_quarantine_decisions"."canonical_decision_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "decrypto_quarantine_decisions" ADD CONSTRAINT "decrypto_quarantine_decisions_game_fk" FOREIGN KEY ("quarantine_game_id") REFERENCES "public"."decrypto_quarantine_games"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "decrypto_quarantine_games_source_app_game_id_unique" ON "decrypto_quarantine_games" USING btree ("source_app","source_game_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "decrypto_quarantine_decisions_idempotency_key_unique" ON "decrypto_quarantine_decisions" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "decrypto_quarantine_decisions_game_decision_unique" ON "decrypto_quarantine_decisions" USING btree ("quarantine_game_id","source_decision_id");
--> statement-breakpoint
CREATE FUNCTION "reject_decrypto_quarantine_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'decrypto quarantine tables are immutable: % on %', TG_OP, TG_TABLE_NAME
		USING ERRCODE = '55000';
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "decrypto_quarantine_games_immutable"
	BEFORE UPDATE OR DELETE OR TRUNCATE ON "decrypto_quarantine_games"
	FOR EACH STATEMENT EXECUTE FUNCTION "reject_decrypto_quarantine_mutation"();
--> statement-breakpoint
CREATE TRIGGER "decrypto_quarantine_decisions_immutable"
	BEFORE UPDATE OR DELETE OR TRUNCATE ON "decrypto_quarantine_decisions"
	FOR EACH STATEMENT EXECUTE FUNCTION "reject_decrypto_quarantine_mutation"();
