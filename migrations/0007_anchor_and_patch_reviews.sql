CREATE TABLE "anchor_evaluations" (
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
CREATE TABLE "patch_reviews" (
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
ALTER TABLE "patch_index"
ADD COLUMN "proposal_id" varchar(64),
ADD COLUMN "review_due_sprint" integer,
ADD COLUMN "review_status" varchar(24),
ADD COLUMN "review_summary" text;
--> statement-breakpoint
ALTER TABLE "coach_sprints"
ADD COLUMN "proposal" jsonb,
ADD COLUMN "anchor_summary" jsonb,
ADD COLUMN "patch_bundle" jsonb;
