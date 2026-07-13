CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text,
	"action" text NOT NULL,
	"actor_email" text NOT NULL,
	"detail" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company_name" text,
	"department" text,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signers" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'signer' NOT NULL,
	"sign_order" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"access_code" text,
	"decline_reason" text,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	CONSTRAINT "contract_signers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"pdf_url" text,
	"pdf_name" text,
	"pdf_size" integer,
	"message" text,
	"expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"signer_id" text,
	"field_type" text DEFAULT 'signature' NOT NULL,
	"label" text,
	"page" integer DEFAULT 1 NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"signer_id" text NOT NULL,
	"field_id" text,
	"type" text DEFAULT 'draw' NOT NULL,
	"image_url" text,
	"value" text,
	"ip_address" text,
	"user_agent" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"pdf_url" text,
	"pdf_name" text,
	"pdf_size" integer,
	"default_message" text,
	"created_by" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"supabase_uid" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_supabase_uid_unique" UNIQUE("supabase_uid")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_signer_id_contract_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."contract_signers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_id_contract_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."contract_signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_field_id_signature_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."signature_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signature_fields_contract_idx" ON "signature_fields" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "signature_fields_signer_idx" ON "signature_fields" USING btree ("signer_id");--> statement-breakpoint
CREATE INDEX "signatures_signer_idx" ON "signatures" USING btree ("signer_id");--> statement-breakpoint
CREATE INDEX "signatures_field_idx" ON "signatures" USING btree ("field_id");