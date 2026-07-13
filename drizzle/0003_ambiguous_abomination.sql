ALTER TABLE "signature_fields" ALTER COLUMN "contract_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD COLUMN "signer_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signature_fields_template_idx" ON "signature_fields" USING btree ("template_id");