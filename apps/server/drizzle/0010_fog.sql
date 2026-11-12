ALTER TABLE "scenes" ADD COLUMN "fog_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_revealed" jsonb DEFAULT '[]'::jsonb NOT NULL;