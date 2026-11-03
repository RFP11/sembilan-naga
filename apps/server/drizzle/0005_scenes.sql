CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"map_key" text NOT NULL,
	"map_mime" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"grid_px" double precision NOT NULL,
	"offset_x" double precision DEFAULT 0 NOT NULL,
	"offset_y" double precision DEFAULT 0 NOT NULL,
	"grid_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "active_scene_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_campaign_idx" ON "scenes" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_active_scene_id_scenes_id_fk" FOREIGN KEY ("active_scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;