ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_contract_id_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "signatures" DROP CONSTRAINT "signatures_contract_id_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "signatures" DROP CONSTRAINT "signatures_signer_id_contract_signers_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_id_contract_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."contract_signers"("id") ON DELETE cascade ON UPDATE no action;