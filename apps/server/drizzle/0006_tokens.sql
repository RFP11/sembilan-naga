CREATE TYPE "public"."token_kind" AS ENUM('monster', 'npc', 'character', 'object');--> statement-breakpoint
CREATE TYPE "public"."token_size" AS ENUM('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan');--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"kind" "token_kind" NOT NULL,
	"name" text NOT NULL,
	"size" "token_size" DEFAULT 'medium' NOT NULL,
	"monster_id" text,
	"character_id" uuid,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"hp_current" integer,
	"hp_max" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_scene_idx" ON "tokens" USING btree ("scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_scene_character_idx" ON "tokens" USING btree ("scene_id","character_id");