ALTER TABLE "ai_call_logs" ADD COLUMN "team" varchar(10);--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "actor_id" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "action_applied" boolean;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "validation_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD COLUMN "team" varchar(10);--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD COLUMN "actor_id" varchar(100);--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD COLUMN "action_applied" boolean;--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD COLUMN "validation_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD COLUMN "private_response_receipt" jsonb;
