CREATE TABLE "sprint_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" varchar(64) NOT NULL,
	"sprint_number" integer NOT NULL,
	"evaluation" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sprint_evaluations_run_id_sprint_number_unique" UNIQUE("run_id","sprint_number")
);
