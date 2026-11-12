CREATE TABLE "pending_attacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attacker_token_id" uuid NOT NULL,
	"target_token_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"critical" boolean NOT NULL,
	"secret" boolean NOT NULL,
	"damage" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encounter_id" uuid NOT NULL,
	"reactor_token_id" uuid NOT NULL,
	"target_token_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "combatants" ADD COLUMN "reaction_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "ac" integer;--> statement-breakpoint
ALTER TABLE "pending_attacks" ADD CONSTRAINT "pending_attacks_attacker_token_id_tokens_id_fk" FOREIGN KEY ("attacker_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_attacks" ADD CONSTRAINT "pending_attacks_target_token_id_tokens_id_fk" FOREIGN KEY ("target_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_attacks" ADD CONSTRAINT "pending_attacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_prompts" ADD CONSTRAINT "reaction_prompts_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_prompts" ADD CONSTRAINT "reaction_prompts_reactor_token_id_tokens_id_fk" FOREIGN KEY ("reactor_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_prompts" ADD CONSTRAINT "reaction_prompts_target_token_id_tokens_id_fk" FOREIGN KEY ("target_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reaction_prompts_unique_idx" ON "reaction_prompts" USING btree ("encounter_id","reactor_token_id");