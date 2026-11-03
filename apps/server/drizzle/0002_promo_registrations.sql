CREATE TYPE "public"."registration_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "campaign_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"character_name" text NOT NULL,
	"start_island" text NOT NULL,
	"sheet_key" text NOT NULL,
	"sheet_name" text NOT NULL,
	"sheet_mime" text NOT NULL,
	"sheet_bytes" integer NOT NULL,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_registrations" ADD CONSTRAINT "campaign_registrations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_registrations" ADD CONSTRAINT "campaign_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_campaign_user_idx" ON "campaign_registrations" USING btree ("campaign_id","user_id");