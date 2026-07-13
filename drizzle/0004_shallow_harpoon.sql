ALTER TABLE "contract_signers" ADD COLUMN "access_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_signers" ADD COLUMN "locked_until" timestamp with time zone;